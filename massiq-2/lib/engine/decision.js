const KG_PER_LB = 0.453592;

const toNum = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const daysBetween = (a, b) => {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 14;
  return Math.max(1, Math.round((db.getTime() - da.getTime()) / 86400000));
};

const deriveWeightKgFromScan = (scan) => {
  const wLbs = toNum(scan?.weight, NaN);
  if (Number.isFinite(wLbs) && wLbs > 0) return wLbs * KG_PER_LB;
  const leanLbs = toNum(scan?.leanMass, NaN);
  const bf = toNum(scan?.bodyFat, NaN);
  if (Number.isFinite(leanLbs) && leanLbs > 0 && Number.isFinite(bf) && bf >= 0 && bf < 60) {
    return (leanLbs / (1 - (bf / 100))) * KG_PER_LB;
  }
  return NaN;
};

export function runDecisionEngine({ profile, plan, scanHistory }) {
  const age = toNum(profile?.age, NaN);
  const heightCm = toNum(profile?.heightCm, NaN);
  const weightKg = toNum(profile?.weightKg, NaN) || (toNum(profile?.weightLbs, 0) * KG_PER_LB);
  if (!Number.isFinite(age) || age <= 0) throw new Error('Invalid age');
  if (!Number.isFinite(heightCm) || heightCm < 140 || heightCm > 220) throw new Error('Invalid height');
  if (!Number.isFinite(weightKg) || weightKg < 40 || weightKg > 200) throw new Error('Invalid weight');

  const scans = Array.isArray(scanHistory) ? scanHistory.filter(Boolean) : [];
  const proteinG = clamp(toNum(plan?.dailyTargets?.protein ?? plan?.macros?.protein, 0), 0, 400);

  if (scans.length === 0) {
    return {
      state: 'no_scan',
      limiting_factor: 'insufficient_data',
      action: 'Calories +0 kcal/day, Protein +0.0 g/kg',
      reason: 'No scan available yet',
      expected_effect: 'First scan will establish baseline state',
    };
  }

  if (scans.length === 1) {
    return {
      state: 'baseline',
      limiting_factor: 'insufficient_data',
      action: 'Calories +0 kcal/day, Protein +0.0 g/kg',
      reason: 'Only one scan available',
      expected_effect: 'Next scan will unlock progress analysis',
    };
  }

  const previous = scans[scans.length - 2];
  const current = scans[scans.length - 1];
  const days = daysBetween(previous?.date, current?.date);

  const prevWeightKg = deriveWeightKgFromScan(previous);
  const currWeightKg = deriveWeightKgFromScan(current);
  const prevBf = toNum(previous?.bodyFat, 0);
  const currBf = toNum(current?.bodyFat, 0);
  const prevLeanKg = toNum(previous?.leanMass, 0) * KG_PER_LB;
  const currLeanKg = toNum(current?.leanMass, 0) * KG_PER_LB;

  const weightChangeKg = Number.isFinite(prevWeightKg) && Number.isFinite(currWeightKg) ? currWeightKg - prevWeightKg : 0;
  const bodyFatChange = currBf - prevBf;
  const leanMassChangeKg = currLeanKg - prevLeanKg;
  const weeklyBfChange = bodyFatChange * (7 / days);
  const proteinPerKg = weightKg > 0 ? proteinG / weightKg : 0;

  let state = 'stable';
  const plateauThresholdKg = 0.2 * (days / 14);
  if (weightChangeKg < 0 && bodyFatChange < 0) state = 'fat_loss';
  if (weightChangeKg < 0 && leanMassChangeKg < 0) state = 'muscle_loss';
  if (Math.abs(weightChangeKg) <= Math.max(0.1, plateauThresholdKg) && days >= 14) state = 'plateau';
  if (weightChangeKg > 0 && weeklyBfChange > 0.5) state = 'excess_fat_gain';

  let limitingFactor = 'no_issue';
  if (proteinPerKg < 1.8) limitingFactor = 'low_protein';
  else if (state === 'muscle_loss') limitingFactor = 'muscle_loss_risk';
  else if (state === 'plateau') limitingFactor = 'insufficient_deficit';
  else if (state === 'excess_fat_gain') limitingFactor = 'surplus_too_high';

  const actionByFactor = {
    low_protein: `Calories +0 kcal/day, Protein +${(2.0 - proteinPerKg).toFixed(1)} g/kg`,
    muscle_loss_risk: `Calories +150 kcal/day, Protein +${(2.2 - proteinPerKg).toFixed(1)} g/kg`,
    insufficient_deficit: 'Calories -100 kcal/day, Protein +0.0 g/kg',
    surplus_too_high: 'Calories -150 kcal/day, Protein +0.0 g/kg',
    insufficient_data: 'Calories +0 kcal/day, Protein +0.0 g/kg',
    no_issue: 'Calories +0 kcal/day, Protein +0.0 g/kg',
  };

  const reasonByFactor = {
    low_protein: 'Protein intake is below optimal for your bodyweight',
    muscle_loss_risk: 'Lean mass is dropping during weight loss',
    insufficient_deficit: 'Weight has not changed over the last 14 days',
    surplus_too_high: 'Body fat is increasing too quickly',
    insufficient_data: 'Only one scan available',
    no_issue: 'Current response is within expected range',
  };

  const effectByFactor = {
    low_protein: 'Increasing protein will improve muscle retention',
    muscle_loss_risk: 'More protein and lower deficit pressure will reduce muscle loss risk',
    insufficient_deficit: 'Reducing calories will restart fat loss',
    surplus_too_high: 'Reducing calories will slow fat gain',
    insufficient_data: 'Next scan will unlock progress analysis',
    no_issue: 'Maintaining targets should sustain current progress',
  };

  return {
    state,
    limiting_factor: limitingFactor,
    action: actionByFactor[limitingFactor],
    reason: reasonByFactor[limitingFactor],
    expected_effect: effectByFactor[limitingFactor],
  };
}
