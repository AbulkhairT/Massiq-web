/** Mirrors MassIQ calcTargets / calcMacros / clampMacros for server routes. */

export function calcTargets(profile, scanData = null) {
  if (!profile) {
    return {
      calories: 2000, protein: 150, carbs: 200, fat: 67, tdee: 2400, steps: 9000, sleepHours: 8, waterLiters: 3, trainingDaysPerWeek: 4, cardioDays: 2,
    };
  }
  const weightLbs = Number(profile.weightLbs) || 165;
  const weightKg = weightLbs * 0.453592;
  const heightCm = Number(profile.heightCm) || 175;
  const age = Number(profile.age) || 25;
  const isMale = (profile.gender || 'Male') !== 'Female';
  const bmr = isMale
    ? (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5
    : (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
  const activityMult = { Sedentary: 1.2, Light: 1.375, Moderate: 1.55, Active: 1.725 };
  const mult = activityMult[profile.activity] || 1.375;
  const tdee = Math.round(bmr * mult);
  const goal = (profile.goal || 'Maintain').toLowerCase();
  let calories = goal === 'cut' ? tdee - 400
    : goal === 'bulk' ? tdee + 300
    : tdee;
  calories = Math.max(calories, 1500);
  let protein;
  if (scanData && scanData.leanMass > 0) {
    const leanMassKg = scanData.leanMass * 0.453592;
    protein = Math.round(leanMassKg * 2.2);
  } else {
    protein = Math.round(weightKg * 2.0);
  }
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));
  const trainingDaysPerWeek = goal === 'bulk' ? 5 : goal === 'cut' ? 4 : 3;
  const cardioDays = goal === 'cut' ? 3 : goal === 'bulk' ? 1 : 2;
  return {
    calories,
    protein,
    carbs,
    fat,
    tdee,
    steps: goal === 'cut' ? 10000 : 9000,
    sleepHours: 8,
    waterLiters: Math.round(weightKg * 0.033 * 10) / 10,
    trainingDaysPerWeek,
    cardioDays,
  };
}

export function calcMacros(profile) {
  return calcTargets(profile, null);
}

export function clampMacros(macros, profile) {
  if (!macros) return macros;
  const kg = Math.max(40, (profile?.weightLbs || 180) * 0.453592);
  const tdee = Number(macros?.tdee || calcMacros(profile)?.tdee || 2400);
  const goal = profile?.goal || 'Maintain';
  const minCalories = Math.round(tdee * (goal === 'Cut' ? 0.65 : 0.75));
  const maxCalories = Math.round(tdee * (goal === 'Bulk' ? 1.25 : 1.15));
  const calories = Math.max(minCalories, Math.min(Number(macros.calories || 2000), maxCalories));
  const minProtein = Math.round(kg * 1.55);
  const maxProtein = Math.round(kg * 3.0);
  const protein = Math.max(minProtein, Math.min(Number(macros.protein || 150), maxProtein));
  const fatFloor = Math.round(kg * 0.8);
  const fatFromCalories = Math.round((calories * 0.35) / 9);
  const fat = Math.max(fatFloor, Math.min(Number(macros.fat || 60), fatFromCalories));
  const recalculatedCarbs = Math.round(Math.max(0, (calories - (protein * 4 + fat * 9)) / 4));
  const carbs = Math.max(30, Number.isFinite(recalculatedCarbs) ? recalculatedCarbs : Number(macros.carbs || 180));
  return {
    ...macros,
    calories,
    protein,
    fat,
    carbs,
    steps: Math.min(15000, Math.max(5000, Number(macros.steps || 9000))),
    sleepHours: Math.min(10, Math.max(7, Number(macros.sleepHours || 8))),
    waterLiters: Math.min(6, Math.max(2, Number(macros.waterLiters || 3))),
    trainingDaysPerWeek: Math.min(6, Math.max(3, Number(macros.trainingDaysPerWeek || 4))),
    cardioDays: Math.min(4, Math.max(0, Number(macros.cardioDays || 2))),
  };
}
