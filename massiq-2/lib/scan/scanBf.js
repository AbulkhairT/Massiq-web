/**
 * Body-fat value helpers — shared by MassIQ and server scan pipeline.
 */

export function getBF(scan) {
  if (!scan) return null;
  const bf = scan.bodyFatPct ?? scan.bodyFat;
  if (bf == null) return null;
  if (typeof bf === 'number') return bf;
  if (typeof bf === 'object') return bf.midpoint ?? bf.low ?? Object.values(bf)[0] ?? null;
  return parseFloat(bf) || null;
}

export function getBFDisplay(scan) {
  if (!scan) return '—';
  const bf = scan.bodyFatPct ?? scan.bodyFat;
  if (bf == null) return '—';
  if (typeof bf === 'number') return bf.toFixed(1) + '%';
  if (typeof bf === 'object' && bf.low != null && bf.high != null) return bf.low + '\u2013' + bf.high + '%';
  if (typeof bf === 'object' && bf.midpoint != null) return bf.midpoint.toFixed(1) + '%';
  const n = parseFloat(bf);
  return isNaN(n) ? '—' : n.toFixed(1) + '%';
}
