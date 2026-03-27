/** Tier labels used by MassIQ UI and sanitizeScanData. */

export function getPhysiqueTier(score) {
  const s = Number(score || 0);
  if (s < 40) return 'Foundation';
  if (s < 60) return 'Developing';
  if (s < 75) return 'Athletic';
  if (s < 90) return 'Advanced';
  return 'Elite';
}

export function getPhysiqueReinforcement(tier) {
  if (tier === 'Foundation') return 'Building your base - early progress comes fast.';
  if (tier === 'Developing') return 'Strong base - visible progress ahead.';
  if (tier === 'Athletic') return 'Well-developed physique - refining details now.';
  if (tier === 'Advanced') return 'High-level physique - pushing toward elite.';
  return 'Top-tier physique.';
}

export function estimateStagePercentile(score, tier) {
  const baseByTier = { Foundation: 20, Developing: 45, Athletic: 68, Advanced: 84, Elite: 95 };
  const base = baseByTier[tier] || 50;
  const local = Math.max(0, Math.min(1, (Number(score || 0) % 10) / 10));
  return Math.max(5, Math.min(99, Math.round(base + (local - 0.5) * 8)));
}
