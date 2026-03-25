/**
 * Feature gate definitions — single source of truth.
 *
 * All premium access logic runs through here.
 * Do NOT scatter isPremium checks across the codebase.
 *
 * FREE tier = snapshot insight (BF%, basic label, short summary)
 * PREMIUM tier = evolving intelligence + transformation guidance
 */

export const FEATURES = Object.freeze({
  // ── Free features ─────────────────────────────────────────────────────────
  BASIC_SCAN_VIEW:    'BASIC_SCAN_VIEW',   // BF%, basic label, short summary only
  CURRENT_PLAN:       'CURRENT_PLAN',      // static macro snapshot (no scan-backed updates)
  PROFILE:            'PROFILE',           // profile management

  // ── Premium features ──────────────────────────────────────────────────────
  FULL_SCAN_DETAILS:  'FULL_SCAN_DETAILS', // limiting factor, muscle assessment, detailed explanations
  SCAN_COMPARISON:    'SCAN_COMPARISON',   // scan-to-scan delta analysis
  SCAN_HISTORY:       'SCAN_HISTORY',      // full history with deltas and trends
  PROJECTIONS:        'PROJECTIONS',       // goal timeline + projected BF
  ADAPTIVE_PLAN:      'ADAPTIVE_PLAN',     // scan-backed macro recalculation
  TREND_ANALYSIS:     'TREND_ANALYSIS',    // multi-scan trend surface
  CORRECTIONS:        'CORRECTIONS',       // muscle imbalance / weak-point fixes
  DECISION_LOG:       'DECISION_LOG',      // adaptation decision + rationale
  PREMIUM_INSIGHTS:   'PREMIUM_INSIGHTS',  // FFMI, scoring breakdown
  WORKOUT_ADJUSTMENTS:'WORKOUT_ADJUSTMENTS', // adaptive training changes
  BASIC_PROGRESS:     'BASIC_PROGRESS',    // progress tracking (premium)
});

const FREE_FEATURES = new Set([
  FEATURES.BASIC_SCAN_VIEW,
  FEATURES.CURRENT_PLAN,
  FEATURES.PROFILE,
]);

/**
 * Free users get this many completed (non-duplicate) body scans.
 * Premium users have no limit.
 */
export const FREE_SCAN_LIMIT = 2;

/**
 * Free users get this many food scans per day.
 * Premium users have no limit.
 */
export const FREE_FOOD_SCAN_LIMIT = 2;

/** Client-local today in YYYY-MM-DD for daily reset comparison. */
function getTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Returns the number of food scans used today.
 * Source of truth: entitlements.free_food_scans_date + free_food_scans_used_today.
 * When date is null or before today, returns 0. Never uses localStorage.
 */
export function getFoodScansUsedToday(entitlements, userId) {
  if (entitlements == null) return 0;
  const storedDate = entitlements.free_food_scans_date;
  const today = getTodayLocal();
  if (!storedDate || String(storedDate).slice(0, 10) !== today) return 0;
  const used = Number(entitlements.free_food_scans_used_today);
  return Number.isFinite(used) ? used : 0;
}

/**
 * Updates local cache after a food scan. Call when DB has been incremented.
 * Does NOT enforce limits — server is source of truth.
 */
export function setFoodScanCache(userId, usedToday) {
  if (!userId || !Number.isFinite(usedToday)) return;
  try {
    const today = getTodayLocal();
    localStorage.setItem(`miq:food-scans-today:${userId}`, JSON.stringify({ date: today, used: usedToday }));
  } catch {}
}

/**
 * Returns true if the user can perform a food scan right now.
 * Free users: 2 per day. Premium: unlimited.
 */
export function canFoodScan(subscription, entitlements, userId) {
  if (isPremiumActive(subscription)) return true;
  const used = getFoodScansUsedToday(entitlements, userId);
  return used < FREE_FOOD_SCAN_LIMIT;
}

/**
 * Returns the number of free food scans remaining today.
 */
export function foodScansRemainingToday(subscription, entitlements, userId) {
  if (isPremiumActive(subscription)) return Infinity;
  const used = getFoodScansUsedToday(entitlements, userId);
  return Math.max(0, FREE_FOOD_SCAN_LIMIT - used);
}


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
  return scanHistory.filter((s) => s && s.scanStatus !== 'duplicate' && !s.duplicateOfScanId).length;
}

/**
 * Returns true if the user is allowed to run a new scan.
 * Premium users: always. Free users: use user_entitlements from DB when logged in (no local bypass).
 *
 * @param {object|null} subscription - subscription row from DB
 * @param {Array}       scanHistory  - local scan history (fallback when not logged in)
 * @param {object|null} entitlements - user_entitlements row from DB
 * @param {boolean}     isLoggedIn   - when true, entitlements must be loaded from DB (null → cannot scan)
 */
export function canScan(subscription, scanHistory, entitlements = null, isLoggedIn = false) {
  if (isPremiumActive(subscription)) return true;
  if (entitlements != null) {
    const limit = Number(entitlements.free_scan_limit) || FREE_SCAN_LIMIT;
    const used = Number(entitlements.free_scans_used) || 0;
    return used < limit;
  }
  if (isLoggedIn) return false;
  return getScanCount(scanHistory) < FREE_SCAN_LIMIT;
}

/**
 * Returns the number of free scans remaining (Infinity for premium users).
 *
 * @param {object|null} subscription - subscription row from DB
 * @param {Array}       scanHistory  - local scan history (fallback when not logged in)
 * @param {object|null} entitlements - user_entitlements row from DB
 * @param {boolean}     isLoggedIn   - when true, require DB row for counts
 */
/**
 * @returns {number|null} null when logged in but entitlements not loaded yet (do not guess).
 */
export function scansRemaining(subscription, scanHistory, entitlements = null, isLoggedIn = false) {
  if (isPremiumActive(subscription)) return Infinity;
  if (entitlements != null) {
    const limit = Number(entitlements.free_scan_limit) || FREE_SCAN_LIMIT;
    const used = Number(entitlements.free_scans_used) || 0;
    return Math.max(0, limit - used);
  }
  if (isLoggedIn) return null;
  return Math.max(0, FREE_SCAN_LIMIT - getScanCount(scanHistory));
}

/**
 * True when a free-tier user may not start another body scan.
 * When logged in, uses user_entitlements only (no local scanHistory fallback).
 * When logged in but entitlements are still null, returns false so UI does not show a false "limit reached" wall.
 */
export function isBodyScanQuotaExhausted(subscription, scanHistory, entitlements, isLoggedIn) {
  if (isPremiumActive(subscription)) return false;
  if (isLoggedIn) {
    if (entitlements == null) return false;
    const limit = Number(entitlements.free_scan_limit) || FREE_SCAN_LIMIT;
    const used = Number(entitlements.free_scans_used) || 0;
    return used >= limit;
  }
  return getScanCount(scanHistory) >= FREE_SCAN_LIMIT;
}
