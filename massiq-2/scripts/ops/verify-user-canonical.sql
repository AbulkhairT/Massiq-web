-- Manual verification in Supabase SQL editor.
-- Replace REPLACE_ME_USER_UUID with your test user's id (keep the quotes).

-- 1) Latest plan
select id, user_id, phase, start_date, week, created_at
from public.plans
where user_id = 'REPLACE_ME_USER_UUID'
order by created_at desc
limit 1;

-- 2) Latest plan_weeks (continuity)
select *
from public.plan_weeks
where user_id = 'REPLACE_ME_USER_UUID'
order by week_number desc, updated_at desc
limit 5;

-- 3) Latest meal_plans + counts of normalized children
with mp as (
  select id, user_id, plan_id, updated_at
  from public.meal_plans
  where user_id = 'REPLACE_ME_USER_UUID'
  order by updated_at desc
  limit 1
)
select mp.*,
  (select count(*)::int from public.meal_plan_days d where d.meal_plan_id = mp.id) as meal_plan_days,
  (select count(*)::int from public.meal_plan_items i
     join public.meal_plan_days d on d.id = i.meal_plan_day_id
     where d.meal_plan_id = mp.id) as meal_plan_items
from mp;

-- 4) Latest workout_programs + normalized counts
with wp as (
  select id, user_id, plan_id, updated_at
  from public.workout_programs
  where user_id = 'REPLACE_ME_USER_UUID'
  order by updated_at desc
  limit 1
)
select wp.*,
  (select count(*)::int from public.workout_program_days d where d.workout_program_id = wp.id) as workout_days,
  (select count(*)::int from public.workout_program_exercises e
     join public.workout_program_days d on d.id = e.workout_program_day_id
     where d.workout_program_id = wp.id) as workout_exercises
from wp;

-- 5) Symmetry corrections (recent)
select id, scan_id, plan_id, area, left(action, 120) as action_preview, source, created_at
from public.symmetry_corrections
where user_id = 'REPLACE_ME_USER_UUID'
order by created_at desc
limit 20;

-- 6) Product events (recent)
select event_name, payload, created_at
from public.product_events
where user_id = 'REPLACE_ME_USER_UUID'
order by created_at desc
limit 30;

-- 7) Scan capture + quality
select id, status, scan_id, platform, capture_mode, started_at, completed_at
from public.scan_capture_sessions
where user_id = 'REPLACE_ME_USER_UUID'
order by started_at desc
limit 10;

select id, scan_id, confidence_label, recommendation, created_at
from public.scan_quality_reviews
where user_id = 'REPLACE_ME_USER_UUID'
order by created_at desc
limit 10;
