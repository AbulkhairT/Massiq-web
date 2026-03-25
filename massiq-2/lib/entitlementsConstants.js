/**
 * When subscription is active/trialing, user_entitlements.free_scan_limit is set to
 * this sentinel so DB rows never show misleading "used > limit" for premium users.
 * Not used for gating — isPremiumActive(subscription) is authoritative.
 */
export const PREMIUM_SCAN_QUOTA_SENTINEL = 999_999;
