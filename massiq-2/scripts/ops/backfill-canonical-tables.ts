/**
 * One-off backfill: populate normalized tables from legacy JSON columns.
 *
 * Requires (same as web app + service role):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  (unused if service role only; still required by client hasConfig)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Run from massiq-2/:
 *   npx tsx scripts/ops/backfill-canonical-tables.ts [--dry-run] [--user=UUID] [--force]
 *   npx tsx scripts/ops/backfill-canonical-tables.ts --skip-symmetry --skip-plans
 *
 * --force  Re-write normalized rows even if meal_plan_days / workout_program_days already exist.
 */

import {
  serviceRoleFetch,
  syncMealPlanNormalizedRows,
  syncWorkoutProgramNormalizedRows,
  upsertPlanWeekRow,
  insertSymmetryCorrectionRows,
  computeProgramWeekNumber,
} from '../../lib/supabase/client.js';

const todayStr = () => new Date().toISOString().slice(0, 10);

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const userArg = process.argv.find((a) => a.startsWith('--user='));
  const userId = userArg ? userArg.split('=')[1]?.trim() : null;
  const skip = {
    meals: process.argv.includes('--skip-meals'),
    workout: process.argv.includes('--skip-workout'),
    plans: process.argv.includes('--skip-plans'),
    symmetry: process.argv.includes('--skip-symmetry'),
  };
  return { dryRun, force, userId, skip };
}

async function fetchAllRows(pathBase: string, filterUser: string | null): Promise<unknown[]> {
  const pageSize = 500;
  const out: unknown[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const q = filterUser ? `${pathBase}&user_id=eq.${filterUser}` : pathBase;
    const url = `${q}&limit=${pageSize}&offset=${offset}`;
    const rows = (await serviceRoleFetch(url, { method: 'GET' })) as unknown[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

async function countNormalizedMealDays(mealPlanId: string): Promise<number> {
  const rows = (await serviceRoleFetch(
    `/rest/v1/meal_plan_days?meal_plan_id=eq.${mealPlanId}&select=id`,
    { method: 'GET' },
  )) as { id?: string }[];
  return Array.isArray(rows) ? rows.length : 0;
}

async function countNormalizedWorkoutDays(workoutProgramId: string): Promise<number> {
  const rows = (await serviceRoleFetch(
    `/rest/v1/workout_program_days?workout_program_id=eq.${workoutProgramId}&select=id`,
    { method: 'GET' },
  )) as { id?: string }[];
  return Array.isArray(rows) ? rows.length : 0;
}

async function hasPlanWeekRow(planId: string, weekNumber: number): Promise<boolean> {
  const rows = (await serviceRoleFetch(
    `/rest/v1/plan_weeks?plan_id=eq.${planId}&week_number=eq.${weekNumber}&select=id&limit=1`,
    { method: 'GET' },
  )) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

function extractSymmetryItems(scan: Record<string, unknown>): { area: string; action: string; source: string }[] {
  const items: { area: string; action: string; source: string }[] = [];
  const ctx = (scan.scan_context as Record<string, unknown>) || {};
  const de = ctx.decision_engine as Record<string, unknown> | undefined;
  const ta = de?.training_adjustments as { unilateral?: boolean } | undefined;
  if (ta?.unilateral) {
    items.push({
      area: 'Balance',
      action:
        'Add unilateral accessories for lagging or asymmetric sides; prioritize symmetry in weekly volume.',
      source: 'backfill_legacy_engine',
    });
  }
  const pa = ctx.premium_analysis as Record<string, unknown> | undefined;
  const bn = pa?.balance_note;
  if (bn && String(bn).trim()) {
    items.push({
      area: 'Symmetry',
      action: String(bn).slice(0, 1900),
      source: 'backfill_balance_note',
    });
  }
  const notes = scan.scan_notes as string | undefined;
  if (notes && /symmetr|asymmetr|imbalance|balance/i.test(notes)) {
    items.push({
      area: 'Symmetry',
      action: String(notes).slice(0, 500),
      source: 'backfill_scan_notes',
    });
  }
  return items;
}

async function countSymmetryForScan(scanId: string): Promise<number> {
  const rows = (await serviceRoleFetch(
    `/rest/v1/symmetry_corrections?scan_id=eq.${scanId}&select=id`,
    { method: 'GET' },
  )) as unknown[];
  return Array.isArray(rows) ? rows.length : 0;
}

async function main() {
  const { dryRun, force, userId, skip } = parseArgs();
  console.info('[backfill] start', { dryRun, force, userId: userId || 'all', skip });

  let mealSynced = 0;
  let workoutSynced = 0;
  let planWeeksUpserted = 0;
  let symmetryInserted = 0;

  if (!skip.meals) {
    const path = `/rest/v1/meal_plans?select=id,user_id,plan_id,meals,updated_at&order=updated_at.desc`;
    const mealPlans = (await fetchAllRows(path, userId)) as {
      id: string;
      user_id: string;
      plan_id: string;
      meals: unknown;
    }[];
    for (const mp of mealPlans) {
      const meals = Array.isArray(mp.meals) ? mp.meals : [];
      if (meals.length === 0) continue;
      const n = await countNormalizedMealDays(mp.id);
      if (n > 0 && !force) continue;
      if (dryRun) {
        console.info('[dry-run] would sync meal_plan', mp.id, 'days', meals.length);
        mealSynced += 1;
        continue;
      }
      await syncMealPlanNormalizedRows(null, mp.user_id, mp.id, meals as never[], { serviceRole: true });
      mealSynced += 1;
      console.info('[backfill] meal_plan normalized', { meal_plan_id: mp.id, user_id: mp.user_id, days: meals.length });
    }
  }

  if (!skip.workout) {
    const path = `/rest/v1/workout_programs?select=id,user_id,plan_id,structure,updated_at&order=updated_at.desc`;
    const wps = (await fetchAllRows(path, userId)) as {
      id: string;
      user_id: string;
      plan_id: string;
      structure: { days?: unknown[] };
    }[];
    for (const wp of wps) {
      const days = wp.structure?.days;
      if (!Array.isArray(days) || days.length === 0) continue;
      const n = await countNormalizedWorkoutDays(wp.id);
      if (n > 0 && !force) continue;
      if (dryRun) {
        console.info('[dry-run] would sync workout_program', wp.id, 'days', days.length);
        workoutSynced += 1;
        continue;
      }
      await syncWorkoutProgramNormalizedRows(null, wp.user_id, wp.id, days as never[], { serviceRole: true });
      workoutSynced += 1;
      console.info('[backfill] workout_program normalized', {
        workout_program_id: wp.id,
        user_id: wp.user_id,
        days: days.length,
      });
    }
  }

  if (!skip.plans) {
    const path = `/rest/v1/plans?select=id,user_id,phase,start_date,week,created_at&order=created_at.desc`;
    const plans = (await fetchAllRows(path, userId)) as {
      id: string;
      user_id: string;
      phase: string;
      start_date: string | null;
    }[];
    const t = todayStr();
    for (const p of plans) {
      const start = p.start_date ? String(p.start_date).slice(0, 10) : t;
      const weekNumber = computeProgramWeekNumber(start, t);
      const exists = await hasPlanWeekRow(p.id, weekNumber);
      if (exists && !force) continue;
      const plan = {
        startDate: start,
        phase: p.phase || 'maintain',
      };
      if (dryRun) {
        console.info('[dry-run] would upsert plan_week', { plan_id: p.id, weekNumber });
        planWeeksUpserted += 1;
        continue;
      }
      await upsertPlanWeekRow(null, p.user_id, { planId: p.id, plan, todayStr: t }, { serviceRole: true });
      planWeeksUpserted += 1;
      console.info('[backfill] plan_week upserted', { plan_id: p.id, user_id: p.user_id, week_number: weekNumber });
    }
  }

  if (!skip.symmetry) {
    const path = `/rest/v1/scans?select=id,user_id,scan_context,scan_notes,created_at&order=created_at.desc`;
    const scans = (await fetchAllRows(path, userId)) as Record<string, unknown>[];
    for (const scan of scans) {
      const scanId = String(scan.id);
      const uid = String(scan.user_id);
      const existing = await countSymmetryForScan(scanId);
      if (existing > 0 && !force) continue;
      const items = extractSymmetryItems(scan);
      if (items.length === 0) continue;
      const planId = null as string | null;
      if (dryRun) {
        console.info('[dry-run] would insert symmetry rows', { scan_id: scanId, n: items.length });
        symmetryInserted += 1;
        continue;
      }
      if (existing > 0 && force) {
        await serviceRoleFetch(`/rest/v1/symmetry_corrections?scan_id=eq.${scanId}`, { method: 'DELETE' });
      }
      await insertSymmetryCorrectionRows(
        null,
        uid,
        { scanId, planId, items },
        { serviceRole: true },
      );
      symmetryInserted += 1;
      console.info('[backfill] symmetry_corrections', { scan_id: scanId, user_id: uid, items: items.length });
    }
  }

  console.info('[backfill] done', {
    meal_plans_synced: mealSynced,
    workout_programs_synced: workoutSynced,
    plan_weeks_upserted: planWeeksUpserted,
    symmetry_batches: symmetryInserted,
  });
}

main().catch((e) => {
  console.error('[backfill] fatal', e);
  process.exit(1);
});
