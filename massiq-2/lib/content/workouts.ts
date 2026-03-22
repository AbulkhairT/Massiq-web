/* ─── MassIQ Workout Plan Generator — Zero-LLM ───────────────────────────
   Replaces generateWorkoutPlan() with deterministic splits.

   Design principles:
   - Standard evidence-based splits (PPL, Upper/Lower, Full Body)
   - Compound lifts prioritised, isolation as accessories
   - Goal-aware: Cut adds cardio, Bulk adds volume, Recomp balances both
   - All exercise cues are real technique notes, not generic fluff
─────────────────────────────────────────────────────────────────────────── */

export interface Exercise {
  name:      string
  sets:      number
  reps:      string
  rest:      string
  weight:    string
  technique: string
}

export interface WorkoutDay {
  day:          string
  isTrainingDay: boolean
  workoutType:  string
  focus:        string[]
  duration:     string
  warmup:       string
  cooldown:     string
  exercises:    Exercise[]
  cardio?:      string
}

export interface SymmetryAction {
  area: string
  action: string
}

export interface WorkoutIntelligence {
  trainingEmphasis?: 'preservation' | 'hypertrophy' | 'correction' | 'recovery'
  recoveryRisk?: boolean
  plateau?: boolean
  cardioDelta?: number
  volumeDelta?: number
  symmetryActions?: SymmetryAction[]
}

/* ─── Exercise library ───────────────────────────────────────────────────── */

const EX = {
  // Chest
  benchPress:    { name: 'Barbell Bench Press',   sets: 4, reps: '6–8',   rest: '2 min',  weight: '75–85% 1RM', technique: 'Lower to lower chest. Elbows 45°. Drive feet into floor. Full ROM.' },
  dbBenchPress:  { name: 'Dumbbell Bench Press',  sets: 3, reps: '8–12',  rest: '90s',    weight: '70–75% 1RM', technique: 'Full range. Control the lowering phase (2–3s). Drive up powerfully.' },
  inclineBench:  { name: 'Incline Bench Press',   sets: 3, reps: '8–10',  rest: '90s',    weight: '70–75% 1RM', technique: '30–45° incline. Targets upper chest. Drive elbows forward at top.' },
  cableFly:      { name: 'Cable Crossover Fly',   sets: 3, reps: '12–15', rest: '60s',    weight: 'Moderate',   technique: 'Slight forward lean. Drive hands together. Squeeze chest at peak.' },
  pushUps:       { name: 'Push-Ups',              sets: 3, reps: '15–20', rest: '60s',    weight: 'Bodyweight', technique: 'Straight body line. Chest touches floor. Elbows at 45° throughout.' },

  // Back
  deadlift:      { name: 'Conventional Deadlift', sets: 4, reps: '4–6',   rest: '3 min',  weight: '80–90% 1RM', technique: 'Bar over mid-foot. Hinge at hip. Drive floor away. Bar stays close to shins.' },
  pullUps:       { name: 'Pull-Ups',              sets: 4, reps: '5–8',   rest: '2 min',  weight: 'Bodyweight', technique: 'Dead hang start. Retract scapula first. Drive elbows to hips. Full extension.' },
  latPulldown:   { name: 'Lat Pulldown',          sets: 3, reps: '10–12', rest: '90s',    weight: '70–75% 1RM', technique: 'Slight lean back. Lead with elbows. Full stretch at top. Squeeze lats at bottom.' },
  seatedRow:     { name: 'Seated Cable Row',      sets: 3, reps: '10–12', rest: '90s',    weight: '70–75% 1RM', technique: 'Neutral spine. Drive elbows back past torso. Hold 1s. Control the return.' },
  bentOverRow:   { name: 'Barbell Bent-Over Row', sets: 4, reps: '6–8',   rest: '2 min',  weight: '75–80% 1RM', technique: 'Hip hinge at 45°. Bar to lower chest. Squeeze shoulder blades together.' },
  tBarRow:       { name: 'T-Bar Row',             sets: 3, reps: '8–10',  rest: '90s',    weight: '70–75% 1RM', technique: 'Chest on pad. Drive elbows back. Hold peak contraction 1s each rep.' },

  // Shoulders
  ohPress:       { name: 'Overhead Press',        sets: 4, reps: '6–8',   rest: '2 min',  weight: '75–80% 1RM', technique: 'Bar at upper chest. Press overhead. Bar slightly behind head at top. Core tight.' },
  dbOhPress:     { name: 'Dumbbell Shoulder Press', sets: 3, reps: '8–10', rest: '90s',  weight: '65–70% 1RM', technique: 'Neutral grip or pronated. Drive elbows forward. Do not fully lock out.' },
  lateralRaise:  { name: 'Lateral Raise',         sets: 4, reps: '12–15', rest: '60s',    weight: 'Light–Moderate', technique: 'Slight elbow bend. Raise to just above shoulder height. Slow eccentric (3s down).' },
  frontRaise:    { name: 'Front Raise',           sets: 3, reps: '12–15', rest: '60s',    weight: 'Light',      technique: 'Alternate or bilateral. Raise to shoulder height. Control descent.' },
  rearDeltFly:   { name: 'Rear Delt Fly',         sets: 3, reps: '12–15', rest: '60s',    weight: 'Light',      technique: 'Hinge forward 45°. Drive elbows back and out. Squeeze rear delts at top.' },

  // Legs
  squat:         { name: 'Barbell Back Squat',    sets: 4, reps: '5–7',   rest: '3 min',  weight: '80–85% 1RM', technique: 'Bar on traps. Hip crease below knee at bottom. Knees track over toes. Drive up through heels.' },
  frontSquat:    { name: 'Front Squat',           sets: 3, reps: '6–8',   rest: '2 min',  weight: '70–75% 1RM', technique: 'Elbows high. Chest up. Hip crease below knees. More quad dominant than back squat.' },
  legPress:      { name: 'Leg Press',             sets: 3, reps: '10–12', rest: '90s',    weight: '75–80% 1RM', technique: 'Feet shoulder-width. Drive through heels. Do not lock out at top. Full range.' },
  rdl:           { name: 'Romanian Deadlift',     sets: 3, reps: '8–10',  rest: '90s',    weight: '65–70% 1RM', technique: 'Slight knee bend. Push hips back. Feel hamstring stretch. Drive hips forward to finish.' },
  lunges:        { name: 'Dumbbell Lunges',       sets: 3, reps: '10–12 each', rest: '90s', weight: 'Moderate', technique: 'Step forward, lower rear knee to near floor. Push through front heel to return.' },
  legCurl:       { name: 'Lying Leg Curl',        sets: 3, reps: '10–12', rest: '60s',    weight: '65–70% 1RM', technique: 'Hips down. Curl heel to glute. Hold 1s at top. Slow 3s eccentric.' },
  legExtension:  { name: 'Leg Extension',         sets: 3, reps: '12–15', rest: '60s',    weight: '60–65% 1RM', technique: 'Full extension at top. Hold 1s. 3s eccentric. Do not hyperextend the knee.' },
  calfRaise:     { name: 'Standing Calf Raise',   sets: 4, reps: '15–20', rest: '60s',    weight: 'Moderate–Heavy', technique: 'Full range. Stretch at bottom. Rise to tiptoe. Hold 1s at top. Slow down (3s).' },

  // Arms
  barbellCurl:   { name: 'Barbell Curl',          sets: 3, reps: '8–12',  rest: '60s',    weight: '65–70% 1RM', technique: 'No swinging. Full ROM. Squeeze bicep at top. Slow 3s lowering phase.' },
  hammerCurl:    { name: 'Hammer Curl',           sets: 3, reps: '10–12', rest: '60s',    weight: 'Moderate',   technique: 'Neutral grip. Alternate arms. Controlled eccentric. Target brachialis.' },
  tricepPushdown:{ name: 'Tricep Pushdown',       sets: 3, reps: '12–15', rest: '60s',    weight: 'Moderate',   technique: 'Elbows at sides. Full extension. Hold peak. 3s eccentric.' },
  skullCrusher:  { name: 'Skull Crusher',         sets: 3, reps: '8–12',  rest: '60s',    weight: '65–70% 1RM', technique: 'Lower bar to forehead. Drive elbows toward ceiling. Forearms vertical.' },
  dipsBench:     { name: 'Bench Dips',            sets: 3, reps: '12–15', rest: '60s',    weight: 'Bodyweight', technique: 'Fingers forward. Lower until upper arm is parallel. Full extension at top.' },

  // Core
  plank:         { name: 'Plank',                 sets: 3, reps: '30–60s', rest: '45s',   weight: 'Bodyweight', technique: 'Straight line from ankles to head. No sagging hips. Breathe steadily.' },
  abCrunch:      { name: 'Crunch',                sets: 3, reps: '15–20', rest: '45s',    weight: 'Bodyweight', technique: 'Lower back on floor. Drive elbows toward knees. Exhale on contraction.' },
  legRaise:      { name: 'Hanging Leg Raise',     sets: 3, reps: '10–12', rest: '60s',    weight: 'Bodyweight', technique: 'Full hang. Raise legs to 90°. Control the descent. No kipping.' },
  russianTwist:  { name: 'Russian Twist',         sets: 3, reps: '12–15 each', rest: '45s', weight: 'Light plate', technique: 'Feet off floor. Rotate fully. Keep chest tall. Drive from obliques.' },
} as const

type ExKey = keyof typeof EX

function ex(key: ExKey, overrides?: Partial<Exercise>): Exercise {
  return { ...EX[key], ...overrides }
}

/* ─── Rest day ───────────────────────────────────────────────────────────── */

const REST_DAY = (day: string): WorkoutDay => ({
  day,
  isTrainingDay: false,
  workoutType:   'Rest',
  focus:         ['Recovery'],
  duration:      '0 min',
  warmup:        '',
  cooldown:      '',
  exercises:     [],
  cardio:        'Optional: 20–30 min low-intensity walk or light mobility work.',
})

/* ─── Cardio modifier by goal ────────────────────────────────────────────── */

function cardioByGoal(goal: string): string | undefined {
  if (goal === 'Cut') return '20 min LISS at 60–65% max HR after lifting, OR 10 min HIIT (30s on / 30s off)'
  if (goal === 'Recomp') return '15–20 min LISS at 60% max HR — keeps NEAT elevated without interfering with recovery'
  return undefined
}

/* ─── 4-day Upper/Lower split ────────────────────────────────────────────── */

function upperLowerSplit(goal: string): WorkoutDay[] {
  const cardio = cardioByGoal(goal)
  return [
    {
      day: 'Monday', isTrainingDay: true, workoutType: 'Upper A — Strength',
      focus: ['Chest', 'Back', 'Shoulders'],
      duration: '55–65 min', warmup: '5 min light cardio + arm circles, band pull-aparts',
      cooldown: '5 min pec stretch, lat stretch, child pose',
      exercises: [ex('benchPress'), ex('bentOverRow'), ex('ohPress'), ex('latPulldown'), ex('cableFly'), ex('lateralRaise')],
      cardio,
    },
    {
      day: 'Tuesday', isTrainingDay: true, workoutType: 'Lower A — Strength',
      focus: ['Quads', 'Hamstrings', 'Glutes'],
      duration: '55–65 min', warmup: '5 min bike + bodyweight squats, hip circles',
      cooldown: '5 min quad stretch, hip flexor stretch, pigeon pose',
      exercises: [ex('squat'), ex('rdl'), ex('legPress'), ex('legCurl'), ex('calfRaise'), ex('plank')],
      cardio,
    },
    REST_DAY('Wednesday'),
    {
      day: 'Thursday', isTrainingDay: true, workoutType: 'Upper B — Hypertrophy',
      focus: ['Back', 'Chest', 'Arms'],
      duration: '60–70 min', warmup: '5 min row + scapular retractions',
      cooldown: '5 min bicep stretch, tricep overhead stretch, doorway pec stretch',
      exercises: [ex('pullUps'), ex('inclineBench'), ex('seatedRow'), ex('dbOhPress'), ex('barbellCurl'), ex('tricepPushdown'), ex('rearDeltFly')],
      cardio,
    },
    {
      day: 'Friday', isTrainingDay: true, workoutType: 'Lower B — Hypertrophy',
      focus: ['Quads', 'Hamstrings', 'Core'],
      duration: '55–65 min', warmup: '5 min bike + leg swings, glute activation',
      cooldown: '5 min hamstring stretch, seated butterfly, cobra pose',
      exercises: [ex('legPress'), ex('lunges'), ex('legExtension'), ex('legCurl'), ex('calfRaise'), ex('legRaise'), ex('russianTwist')],
      cardio,
    },
    REST_DAY('Saturday'),
    REST_DAY('Sunday'),
  ]
}

/* ─── 3-day Full Body split ──────────────────────────────────────────────── */

function fullBodySplit(goal: string): WorkoutDay[] {
  const cardio = cardioByGoal(goal)
  return [
    {
      day: 'Monday', isTrainingDay: true, workoutType: 'Full Body A',
      focus: ['Squat', 'Push', 'Pull'],
      duration: '60–70 min', warmup: '5 min row + dynamic warm-up',
      cooldown: '5 min full body static stretch',
      exercises: [ex('squat'), ex('benchPress'), ex('bentOverRow'), ex('ohPress'), ex('plank')],
      cardio,
    },
    REST_DAY('Tuesday'),
    {
      day: 'Wednesday', isTrainingDay: true, workoutType: 'Full Body B',
      focus: ['Hinge', 'Push', 'Pull'],
      duration: '60–70 min', warmup: '5 min bike + hip activation',
      cooldown: '5 min hamstring, pec, and lat stretches',
      exercises: [ex('deadlift'), ex('inclineBench'), ex('pullUps'), ex('lateralRaise'), ex('legRaise')],
      cardio,
    },
    REST_DAY('Thursday'),
    {
      day: 'Friday', isTrainingDay: true, workoutType: 'Full Body C — Hypertrophy',
      focus: ['Legs', 'Shoulders', 'Arms'],
      duration: '60–70 min', warmup: '5 min bike + shoulder rotations',
      cooldown: '5 min quad, tricep, and bicep stretches',
      exercises: [ex('legPress'), ex('rdl'), ex('dbOhPress'), ex('barbellCurl'), ex('tricepPushdown'), ex('calfRaise')],
      cardio,
    },
    REST_DAY('Saturday'),
    REST_DAY('Sunday'),
  ]
}

/* ─── 5-day PPL + Upper/Lower split ─────────────────────────────────────── */

function pplULSplit(goal: string): WorkoutDay[] {
  const cardio = cardioByGoal(goal)
  return [
    {
      day: 'Monday', isTrainingDay: true, workoutType: 'Push — Chest & Shoulders',
      focus: ['Chest', 'Shoulders', 'Triceps'],
      duration: '60–70 min', warmup: '5 min light cardio + arm circles',
      cooldown: '5 min pec, front delt, and tricep stretch',
      exercises: [ex('benchPress'), ex('inclineBench'), ex('dbOhPress'), ex('lateralRaise'), ex('cableFly'), ex('tricepPushdown')],
      cardio,
    },
    {
      day: 'Tuesday', isTrainingDay: true, workoutType: 'Pull — Back & Biceps',
      focus: ['Back', 'Biceps', 'Rear Delts'],
      duration: '60–70 min', warmup: '5 min row + band pull-aparts',
      cooldown: '5 min lat, bicep, and rear delt stretch',
      exercises: [ex('deadlift'), ex('pullUps'), ex('bentOverRow'), ex('latPulldown'), ex('rearDeltFly'), ex('barbellCurl')],
      cardio,
    },
    {
      day: 'Wednesday', isTrainingDay: true, workoutType: 'Legs',
      focus: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
      duration: '65–75 min', warmup: '5 min bike + dynamic leg swings',
      cooldown: '5 min quad, hamstring, hip flexor stretch',
      exercises: [ex('squat'), ex('rdl'), ex('legPress'), ex('lunges'), ex('legCurl'), ex('calfRaise')],
      cardio,
    },
    REST_DAY('Thursday'),
    {
      day: 'Friday', isTrainingDay: true, workoutType: 'Upper — Strength',
      focus: ['Chest', 'Back', 'Shoulders'],
      duration: '55–65 min', warmup: '5 min light cardio + shoulder warm-up',
      cooldown: '5 min upper body static stretches',
      exercises: [ex('ohPress'), ex('tBarRow'), ex('dbBenchPress'), ex('seatedRow'), ex('lateralRaise'), ex('hammerCurl'), ex('skullCrusher')],
      cardio,
    },
    {
      day: 'Saturday', isTrainingDay: true, workoutType: 'Lower — Hypertrophy',
      focus: ['Quads', 'Hamstrings', 'Core'],
      duration: '55–65 min', warmup: '5 min bike + glute activation',
      cooldown: '5 min full lower body stretch',
      exercises: [ex('legPress'), ex('rdl'), ex('legExtension'), ex('legCurl'), ex('calfRaise'), ex('plank'), ex('russianTwist')],
      cardio,
    },
    REST_DAY('Sunday'),
  ]
}

/* ─── 6-day Push/Pull/Legs x2 split ─────────────────────────────────────── */

function pplx2Split(goal: string): WorkoutDay[] {
  const cardio = cardioByGoal(goal)
  return [
    {
      day: 'Monday', isTrainingDay: true, workoutType: 'Push A — Heavy',
      focus: ['Chest', 'Shoulders', 'Triceps'],
      duration: '60–70 min', warmup: '5 min + arm circles',
      cooldown: '5 min pec and delt stretch',
      exercises: [ex('benchPress'), ex('ohPress'), ex('inclineBench'), ex('lateralRaise'), ex('tricepPushdown')],
      cardio,
    },
    {
      day: 'Tuesday', isTrainingDay: true, workoutType: 'Pull A — Heavy',
      focus: ['Back', 'Biceps', 'Rear Delts'],
      duration: '60–70 min', warmup: '5 min row + scapular warm-up',
      cooldown: '5 min lat and bicep stretch',
      exercises: [ex('deadlift'), ex('pullUps'), ex('bentOverRow'), ex('rearDeltFly'), ex('barbellCurl')],
      cardio,
    },
    {
      day: 'Wednesday', isTrainingDay: true, workoutType: 'Legs A — Heavy',
      focus: ['Quads', 'Hamstrings', 'Glutes'],
      duration: '65–75 min', warmup: '5 min bike + hip circles',
      cooldown: '5 min quad, hamstring, hip flexor',
      exercises: [ex('squat'), ex('rdl'), ex('legPress'), ex('legCurl'), ex('calfRaise')],
      cardio,
    },
    {
      day: 'Thursday', isTrainingDay: true, workoutType: 'Push B — Volume',
      focus: ['Upper Chest', 'Side Delts', 'Triceps'],
      duration: '55–65 min', warmup: '5 min + band work',
      cooldown: '5 min static stretches',
      exercises: [ex('inclineBench'), ex('dbOhPress'), ex('cableFly'), ex('lateralRaise'), ex('frontRaise'), ex('skullCrusher')],
      cardio,
    },
    {
      day: 'Friday', isTrainingDay: true, workoutType: 'Pull B — Volume',
      focus: ['Lats', 'Traps', 'Biceps'],
      duration: '55–65 min', warmup: '5 min + lat warm-up',
      cooldown: '5 min lat and rear delt stretch',
      exercises: [ex('latPulldown'), ex('seatedRow'), ex('tBarRow'), ex('rearDeltFly'), ex('hammerCurl'), ex('barbellCurl')],
      cardio,
    },
    {
      day: 'Saturday', isTrainingDay: true, workoutType: 'Legs B — Volume',
      focus: ['Quads', 'Hamstrings', 'Calves', 'Core'],
      duration: '60–70 min', warmup: '5 min bike + glute activation',
      cooldown: '5 min full lower body stretch',
      exercises: [ex('legPress'), ex('lunges'), ex('legExtension'), ex('legCurl'), ex('calfRaise'), ex('plank'), ex('legRaise')],
      cardio,
    },
    REST_DAY('Sunday'),
  ]
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Build a 7-day workout plan.
 * @param goal    Cut | Bulk | Recomp | Maintain
 * @param trainDays  Number of training days per week (3–6)
 * @returns       Array of 7 WorkoutDay objects (Monday–Sunday)
 */
function adaptWorkoutPlan(days: WorkoutDay[], intel?: WorkoutIntelligence): WorkoutDay[] {
  if (!intel) return days
  const volumeDelta = intel.volumeDelta ?? 0
  const cardioDelta = intel.cardioDelta ?? 0
  const symmetryActions = intel.symmetryActions || []
  const unilateralHint = symmetryActions[0]

  return days.map((d) => {
    if (!d.isTrainingDay) return d
    const adaptedExercises = (d.exercises || []).map((ex, idx) => {
      if (idx > 3) return ex
      const newSets = Math.max(2, Math.min(6, (ex.sets || 3) + volumeDelta))
      const lowerStress = intel.recoveryRisk || intel.trainingEmphasis === 'recovery'
      return {
        ...ex,
        sets: newSets,
        reps: lowerStress && ex.reps.includes('6') ? ex.reps.replace('6–8', '8–10').replace('5–7', '8–10') : ex.reps,
      }
    })

    if (intel.trainingEmphasis === 'correction' && unilateralHint) {
      adaptedExercises.push({
        name: `${unilateralHint.area} unilateral correction`,
        sets: 2,
        reps: '10–12 each side',
        rest: '60s',
        weight: 'Moderate',
        technique: unilateralHint.action,
      })
    }

    let cardio = d.cardio
    if (typeof cardio === 'string' && cardioDelta !== 0) {
      cardio = cardioDelta > 0
        ? `${cardio}. Add ${Math.abs(cardioDelta) * 10} min low-intensity finishers.`
        : `${cardio}. Keep cardio conservative this week to protect recovery.`
    }

    return { ...d, exercises: adaptedExercises, cardio }
  })
}

export function buildWorkoutPlan(goal: string, trainDays: number, intel?: WorkoutIntelligence): WorkoutDay[] {
  const days = Math.max(3, Math.min(6, trainDays))
  const base = days <= 3
    ? fullBodySplit(goal)
    : days === 4
      ? upperLowerSplit(goal)
      : days === 5
        ? pplULSplit(goal)
        : pplx2Split(goal)
  return adaptWorkoutPlan(base, intel)
}
