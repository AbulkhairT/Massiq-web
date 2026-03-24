import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Stripe subscription statuses that represent a live, billable subscription.
// If cancel fails for any of these we must NOT delete the account.
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'incomplete', 'unpaid']);

function anonHeaders(token) {
  return {
    apikey:        SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function serviceHeaders() {
  return {
    apikey:        SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbFetch(path, opts) {
  const res = await fetch(`${SUPABASE_URL}${path}`, opts);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.message || body?.error_description || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

/**
 * DELETE /api/user/account
 *
 * Permanently deletes the authenticated user's account and all associated data:
 *   - Stripe subscription (cancelled first — hard block if live sub cancel fails)
 *   - Storage objects (scan photos)
 *   - scan_assets rows
 *   - scans rows
 *   - user_entitlements row
 *   - physique_projections rows
 *   - plans rows
 *   - profiles row
 *   - subscriptions rows
 *   - auth.users entry (via Supabase Admin API)
 *
 * Data cascade: auth.users ON DELETE CASCADE will clean up any remaining rows
 * that have user_id → auth.users FK, so the explicit deletes are belt-and-suspenders.
 *
 * Security:
 *   - JWT verified via /auth/v1/user before any deletion
 *   - All destructive operations use the service role key
 *   - Stripe subscription is cancelled before account data is deleted
 */
export async function DELETE(request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY) {
    console.error('[delete-account] config:missing SUPABASE env vars not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // ── 1. Verify the caller's JWT ────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    console.warn('[delete-account] auth:failed reason=no_token');
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  let userId;
  try {
    const user = await sbFetch('/auth/v1/user', {
      method: 'GET',
      headers: anonHeaders(token),
    });
    userId = user?.id;
    if (!userId) throw new Error('No user id in token response');
  } catch {
    console.warn('[delete-account] auth:failed reason=invalid_token');
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  console.info('[delete-account] auth:ok', { user_id: userId });

  // ── 2. Cancel Stripe subscription before any account deletion ─────────────
  //
  // Rules:
  //   - Fetch the subscription row including status and stripe_subscription_id
  //   - If status is active/trialing/past_due/incomplete/unpaid (live):
  //       • Attempt Stripe cancel
  //       • If cancel FAILS → return 500, do NOT delete the account
  //         (prevents user being deleted while still being charged)
  //   - If status is canceled/incomplete_expired → skip cancel, proceed
  //   - If no subscription row found → proceed
  //   - If DB fetch itself fails → proceed (ambiguous; log warning)
  // ────────────────────────────────────────────────────────────────────────────
  try {
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_subscription_id,status&limit=1`,
      { method: 'GET', headers: serviceHeaders() }
    );

    if (subRes.ok) {
      const subRows = await subRes.json().catch(() => []);
      const sub = Array.isArray(subRows) && subRows.length > 0 ? subRows[0] : null;
      const stripeSubId = sub?.stripe_subscription_id || null;
      const subStatus   = sub?.status || null;

      if (stripeSubId && LIVE_STATUSES.has(subStatus)) {
        console.info('[delete-account] cancel:attempt', { sub_id: stripeSubId, status: subStatus, user_id: userId });

        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeSecretKey) {
          console.error('[delete-account] cancel:blocked', {
            reason: 'STRIPE_SECRET_KEY_missing',
            sub_id: stripeSubId,
            status: subStatus,
            user_id: userId,
          });
          return NextResponse.json(
            { error: 'Cannot delete account: server misconfiguration prevents subscription cancellation. Contact support.' },
            { status: 500 }
          );
        }

        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        try {
          await stripe.subscriptions.cancel(stripeSubId);
          console.info('[delete-account] cancel:success', { sub_id: stripeSubId, user_id: userId });
        } catch (err) {
          console.error('[delete-account] cancel:failed', {
            sub_id: stripeSubId,
            status: subStatus,
            user_id: userId,
            reason: err.message,
          });
          return NextResponse.json(
            {
              error: 'Could not cancel your subscription before account deletion. ' +
                     'Please cancel your subscription manually in billing settings first, or contact support.',
            },
            { status: 500 }
          );
        }
      } else if (stripeSubId) {
        console.info('[delete-account] cancel:skipped', {
          reason: 'already_terminated',
          sub_id: stripeSubId,
          status: subStatus,
          user_id: userId,
        });
      } else {
        console.info('[delete-account] cancel:skipped', { reason: 'no_subscription', user_id: userId });
      }
    } else {
      console.warn('[delete-account] cancel:fetch_failed', {
        reason: `subscriptions_query_${subRes.status}`,
        user_id: userId,
      });
      // Could not confirm subscription state — proceed with deletion.
      // Best-effort: if there is a live sub the webhook will eventually reconcile.
    }
  } catch (err) {
    console.warn('[delete-account] cancel:fetch_error (proceeding)', { user_id: userId, reason: err.message });
  }

  // ── 3. Fetch storage paths before deleting rows ───────────────────────────
  let storagePaths = [];
  try {
    const assets = await sbFetch(
      `/rest/v1/scan_assets?user_id=eq.${userId}&select=storage_path`,
      { method: 'GET', headers: serviceHeaders() },
    );
    storagePaths = Array.isArray(assets)
      ? assets.map(a => a.storage_path).filter(Boolean)
      : [];
  } catch (err) {
    console.warn('[delete-account] storage:fetch_failed (continuing):', err.message);
  }

  // ── 4. Delete storage objects ─────────────────────────────────────────────
  if (storagePaths.length > 0) {
    try {
      await sbFetch('/storage/v1/object/scan-photos', {
        method: 'DELETE',
        headers: serviceHeaders(),
        body: JSON.stringify({ prefixes: storagePaths }),
      });
    } catch (err) {
      console.warn('[delete-account] storage:delete_failed (continuing):', err.message);
    }
  }

  // ── 5. Delete application data (order matters for FK constraints) ─────────
  const tables = [
    'physique_projections',
    'scans',
    'scan_assets',
    'user_entitlements',
    'plans',
    'subscriptions',
    'profiles',
  ];

  const errors = [];
  for (const table of tables) {
    try {
      await sbFetch(`/rest/v1/${table}?user_id=eq.${userId}`, {
        method: 'DELETE',
        headers: serviceHeaders(),
      });
    } catch (err) {
      // Log but continue — auth.users deletion cascade will handle stragglers
      console.warn(`[delete-account] table:delete_failed table=${table}:`, err.message);
      errors.push(`${table}: ${err.message}`);
    }
  }

  // ── 6. Delete auth.users entry (Supabase Admin API) ───────────────────────
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: serviceHeaders(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Admin delete failed (${res.status}): ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.error('[delete-account] auth_user:delete_failed', { user_id: userId, reason: err.message });
    return NextResponse.json(
      { error: 'Account deletion failed — please contact support', details: err.message },
      { status: 500 },
    );
  }

  console.info('[delete-account] complete', { user_id: userId });
  return NextResponse.json({ ok: true });
}
