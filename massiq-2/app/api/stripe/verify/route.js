import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

/**
 * GET /api/stripe/verify?session_id=cs_xxx
 *
 * Server-side verification of a Stripe checkout session.
 * Uses the service role key to check subscription status — no user auth needed.
 * Called from the success page when localStorage has no session (mobile Safari, etc.)
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId || !sessionId.startsWith('cs_')) {
    return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 });
  }

  const secretKey   = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey || !supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const stripe  = new Stripe(secretKey, { apiVersion: '2024-06-20' });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const userId = session.metadata?.user_id;
    if (!userId) {
      return NextResponse.json({ isPremium: false });
    }

    // Use service role key to bypass RLS — no user token needed
    const res = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=status&order=updated_at.desc&limit=5`,
      {
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );

    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ isPremium: false, userId });
    }

    const best      = rows.find(r => r.status === 'active' || r.status === 'trialing') || rows[0];
    const isPremium = ['active', 'trialing'].includes(best.status);

    return NextResponse.json({ isPremium, userId });
  } catch (err) {
    console.error('[stripe:verify]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
