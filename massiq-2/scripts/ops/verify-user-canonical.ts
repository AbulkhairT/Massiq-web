/**
 * Dev/admin: print canonical state for one user (service role).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *   npx tsx scripts/ops/verify-user-canonical.ts <user_uuid>
 */

import { serviceRoleFetch } from '../../lib/supabase/client.js';

async function main() {
  const userId = process.argv[2];
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    console.error('Usage: npx tsx scripts/ops/verify-user-canonical.ts <user_uuid>');
    process.exit(1);
  }

  const u = encodeURIComponent(userId);

  const plan = (
    (await serviceRoleFetch(`/rest/v1/plans?user_id=eq.${u}&select=*&order=created_at.desc&limit=1`, {
      method: 'GET',
    })) as unknown[]
  )[0];

  const planWeeks = (await serviceRoleFetch(
    `/rest/v1/plan_weeks?user_id=eq.${u}&select=*&order=week_number.desc&limit=5`,
    { method: 'GET' },
  )) as unknown[];

  const mealPlan = (
    (await serviceRoleFetch(
      `/rest/v1/meal_plans?user_id=eq.${u}&select=*&order=updated_at.desc&limit=1`,
      { method: 'GET' },
    )) as unknown[]
  )[0] as { id?: string } | undefined;

  let mealDays: unknown[] = [];
  let mealItemsCount = 0;
  if (mealPlan?.id) {
    const mpId = mealPlan.id;
    mealDays = (await serviceRoleFetch(
      `/rest/v1/meal_plan_days?meal_plan_id=eq.${mpId}&select=id,day_index,day_label&order=day_index.asc`,
      { method: 'GET' },
    )) as unknown[];
    for (const d of mealDays as { id: string }[]) {
      const items = (await serviceRoleFetch(
        `/rest/v1/meal_plan_items?meal_plan_day_id=eq.${d.id}&select=id`,
        { method: 'GET' },
      )) as unknown[];
      mealItemsCount += Array.isArray(items) ? items.length : 0;
    }
  }

  const workoutProgram = (
    (await serviceRoleFetch(
      `/rest/v1/workout_programs?user_id=eq.${u}&select=*&order=updated_at.desc&limit=1`,
      { method: 'GET' },
    )) as unknown[]
  )[0] as { id?: string } | undefined;

  let workoutDays: unknown[] = [];
  let exerciseCount = 0;
  if (workoutProgram?.id) {
    const wpId = workoutProgram.id;
    workoutDays = (await serviceRoleFetch(
      `/rest/v1/workout_program_days?workout_program_id=eq.${wpId}&select=id,day_index,day_label&order=day_index.asc`,
      { method: 'GET' },
    )) as unknown[];
    for (const d of workoutDays as { id: string }[]) {
      const ex = (await serviceRoleFetch(
        `/rest/v1/workout_program_exercises?workout_program_day_id=eq.${d.id}&select=id`,
        { method: 'GET' },
      )) as unknown[];
      exerciseCount += Array.isArray(ex) ? ex.length : 0;
    }
  }

  const symmetry = (await serviceRoleFetch(
    `/rest/v1/symmetry_corrections?user_id=eq.${u}&select=*&order=created_at.desc&limit=20`,
    { method: 'GET' },
  )) as unknown[];

  const productEvents = (await serviceRoleFetch(
    `/rest/v1/product_events?user_id=eq.${u}&select=event_name,payload,created_at&order=created_at.desc&limit=30`,
    { method: 'GET' },
  )) as unknown[];

  const captureSessions = (await serviceRoleFetch(
    `/rest/v1/scan_capture_sessions?user_id=eq.${u}&select=id,status,scan_id,started_at,completed_at&order=started_at.desc&limit=10`,
    { method: 'GET' },
  )) as unknown[];

  const qualityReviews = (await serviceRoleFetch(
    `/rest/v1/scan_quality_reviews?user_id=eq.${u}&select=*&order=created_at.desc&limit=10`,
    { method: 'GET' },
  )) as unknown[];

  const summary = {
    user_id: userId,
    latest_plan: plan || null,
    plan_weeks_rows: Array.isArray(planWeeks) ? planWeeks.length : 0,
    plan_weeks_sample: planWeeks,
    latest_meal_plan_id: mealPlan?.id ?? null,
    meal_plan_days_count: mealDays.length,
    meal_plan_items_count: mealItemsCount,
    latest_workout_program_id: workoutProgram?.id ?? null,
    workout_program_days_count: workoutDays.length,
    workout_program_exercises_count: exerciseCount,
    symmetry_corrections_count: Array.isArray(symmetry) ? symmetry.length : 0,
    symmetry_corrections_sample: symmetry,
    product_events_count: Array.isArray(productEvents) ? productEvents.length : 0,
    product_events_sample: productEvents,
    scan_capture_sessions_sample: captureSessions,
    scan_quality_reviews_sample: qualityReviews,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
