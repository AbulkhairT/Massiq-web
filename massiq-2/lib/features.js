/**
 * Feature gate definitions — single source of truth.
 *
 * All premium access logic runs through here.
 * Do NOT scatter isPremium checks across the codebase.
 */

export const FEATURES = Object.freeze({
  // ── Free features ─────────────────────────────────────────────────────────
  BASIC_SCAN_VIEW:    'BASIC_SCAN_VIEW',   // current scan result + core metrics
  SCAN_HISTORY:       'SCAN_HISTORY',      // history list of past scans
  CURRENT_PLAN:       'CURRENT_PLAN',      // current macro snapshot
  BASIC_PROGRESS:     'BASIC_PROGRESS',    // physique chart + basic summary
  PROFILE:            'PROFILE',           // profile management

  // ── Premium features ──────────────────────────────────────────────────────
  SCAN_COMPARISON:    'SCAN_COMPARISON',   // scan-to-scan delta analysis
  PROJECTIONS:        'PROJECTIONS',       // goal timeline + projected BF
  ADAPTIVE_PLAN:      'ADAPTIVE_PLAN',     // adaptive macro recalculation
  TREND_ANALYSIS:     'TREND_ANALYSIS',    // multi-scan trend surface
  CORRECTIONS:        'CORRECTIONS',       // muscle imbalance / weak-point fixes
  DECISION_LOG:       'DECISION_LOG',      // adaptation decision + rationale
  PREMIUM_INSIGHTS:   'PREMIUM_INSIGHTS',  // FFMI, scoring breakdown
  WORKOUT_ADJUSTMENTS:'WORKOUT_ADJUSTMENTS', // adaptive training changes
});

const FREE_FEATURES = new Set([
  FEATURES.BASIC_SCAN_VIEW,
  FEATURES.SCAN_HISTORY,
  FEATURES.CURRENT_PLAN,
  FEATURES.BASIC_PROGRESS,
  FEATURES.PROFILE,
]);

/**
 * Free users get this many completed (non-duplicate) scans.
 * Premium users have no limit.
 */
export const FREE_SCAN_LIMIT = 2;

/**
 * Returns true when the subscription is in an active or trialing state.
 * This is the canonical premium check — use everywhere instead of raw status checks.
 */
export function isPremiumActive(subscription) {
  if (!subscription) return false;
  return ['active', 'trialing'].includes(subscription?.status);
}

/**
 * Returns true if the user can access the given feature.
 * Free features are always accessible; premium features require an active subscription.
 */
export function hasFeature(subscription, feature) {
  if (FREE_FEATURES.has(feature)) return true;
  return isPremiumActive(subscription);
}

/**
 * Count completed (non-duplicate) scans in scan history.
 */
export function getScanCount(scanHistory) {
  if (!Array.isArray(scanHistory)) return 0;
  return scanHistory.filter(s => s.scanStatus !== 'duplicate').length;
}

/**
 * Returns true if the user is allowed to run a new scan.
 * Premium users: always. Free users: up to FREE_SCAN_LIMIT.
 */
export function canScan(subscription, scanHistory) {
  if (isPremiumActive(subscription)) return true;
  return getScanCount(scanHistory) < FREE_SCAN_LIMIT;
}

/**
 * Returns the number of free scans remaining (Infinity for premium users).
 */
export function scansRemaining(subscription, scanHistory) {
  if (isPremiumActive(subscription)) return Infinity;
  return Math.max(0, FREE_SCAN_LIMIT - getScanCount(scanHistory));
}
