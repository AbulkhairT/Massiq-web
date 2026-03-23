const KG_PER_LB = 0.453592;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const activityBand = (activity) => {
  const a = String(activity || '').toLowerCase();
  if (a.includes('sedentary') || a.includes('light') || a === 'low') return 'low';
  if (a.includes('active') || a === 'high') return 'high';
  return 'medium';
};

const normalizeGoal = (goal) => {
  const g = String(goal || '').toLowerCase();
  if (g.includes('bulk') || g.includes('gain')) return 'bulk';
  if (g.includes('cut') || g.includes('lose')) return 'cut';
  if (g.includes('recomp')) return 'recomp';
  return 'maintain';
};

export function isProfileCompleteForPlan(profileDraft) {
  if (!profileDraft) return false;
  const age = Number(profileDraft.age);
  const weightKg = Number(profileDraft.weightKg);
  const weightLbs = Number(profileDraft.weightLbs);
  const heightCm = Number(profileDraft.heightCm);
  const hasWeight = (Number.isFinite(weightKg) && weightKg > 0) || (Number.isFinite(weightLbs) && weightLbs > 0);
  const hasHeight = Number.isFinite(heightCm) && heightCm > 0;
  return Boolean(
    profileDraft.goal
    && profileDraft.activity
    && profileDraft.gender
    && Number.isFinite(age) && age > 0
    && hasWeight
    && hasHeight
  );
}

export function validateProfileForPlan(profile) {
  if (!profile) throw new Error('Missing profile');
  const age = Number(profile.age);
  const directKg = Number(profile.weightKg);
  const fromLbsKg = Number(profile.weightLbs) * KG_PER_LB;
  const weightKg = Number((Number.isFinite(directKg) && directKg > 0 ? directKg : fromLbsKg).toFixed(2));
  const heightCm = Number(profile.heightCm);
  if (!Number.isFinite(age) || age <= 0) throw new Error('Invalid age');
  if (!Number.isFinite(weightKg) || weightKg < 40 || weightKg > 200) throw new Error('Invalid weight');
  if (!Number.isFinite(heightCm) || heightCm < 140 || heightCm > 220) throw new Error('Invalid height');
  return { age, weightKg, heightCm };
}

export function generateDeterministicPlan(profile) {
  const { age, weightKg, heightCm } = validateProfileForPlan(profile);
  const gender = profile?.gender === 'Female' ? 'female' : 'male';
  const multiplier = { low: 1.4, medium: 1.6, high: 1.75 }[activityBand(profile?.activity)] || 1.6;
  const goal = normalizeGoal(profile?.goal);
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + (gender === 'male' ? 5 : -161);
  const tdee = bmr * multiplier;
  const phaseAdjustment = goal === 'cut' ? -400 : goal === 'bulk' ? 300 : 0;
  const calories = clamp(Math.round(tdee + phaseAdjustment), 1200, 5000);

  const proteinFactor = goal === 'cut' ? 2.2 : goal === 'bulk' ? 1.8 : 2.0;
  const protein = Math.round(clamp(weightKg * proteinFactor, weightKg * 1.6, weightKg * 2.4));
  const fat = Math.round(weightKg * 0.9);
  const carbs = Math.max(0, Math.round((calories - (protein * 4) - (fat * 9)) / 4));
  const finalCalories = (protein * 4) + (fat * 9) + (carbs * 4);

  return {
    phase: goal === 'cut' ? 'Cut' : goal === 'bulk' ? 'Bulk' : 'Maintain',
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories: finalCalories,
    protein,
    carbs,
    fat,
    expectedWeeklyWeightKg: goal === 'cut' ? -0.4 : goal === 'bulk' ? 0.25 : 0,
  };
}

export function buildBaselinePlanFromProfile(profile, dateISO = null) {
  const plan = generateDeterministicPlan(profile);
  const targets = {
    calories: plan.calories,
    protein: plan.protein,
    carbs: plan.carbs,
    fat: plan.fat,
    steps: plan.phase === 'Cut' ? 10000 : 8500,
    sleepHours: 8,
    waterLiters: 3,
    trainingDaysPerWeek: plan.phase === 'Bulk' ? 5 : 4,
    cardioDays: plan.phase === 'Bulk' ? 1 : 2,
  };
  const today = dateISO || new Date().toISOString().slice(0, 10);
  const nextScan = new Date(today);
  nextScan.setDate(nextScan.getDate() + 28);
  return {
    phase: plan.phase,
    phaseName: `${plan.phase} Phase`,
    objective: 'Deterministic plan generated from validated profile inputs.',
    week: 1,
    startDate: today,
    nextScanDate: nextScan.toISOString().slice(0, 10),
    macros: {
      calories: targets.calories,
      protein: targets.protein,
      carbs: targets.carbs,
      fat: targets.fat,
    },
    dailyTargets: targets,
    trainDays: targets.trainingDaysPerWeek,
    sleepHrs: targets.sleepHours,
    waterL: targets.waterLiters,
    expectedWeeklyWeightKg: plan.expectedWeeklyWeightKg,
    tdee: plan.tdee,
    bmr: plan.bmr,
  };
}
