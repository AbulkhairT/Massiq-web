# Database Setup Required

## Issue Summary

The MassIQ application onboarding flow is **blocked** at the stats input step due to a missing database table in the Supabase backend.

## Symptoms

- User completes name entry ("Agent Test") ✓
- User selects goal ("Cut") ✓
- User enters stats (weight, height, age, sex) ✓
- User clicks "Continue →" button
- **Button shows loading spinner indefinitely (10+ seconds)**
- Page never advances to the next onboarding step (Activity level selection)

## Root Cause

The Supabase database is missing the `user_entitlements` table.

### Evidence

Browser console shows:
```
[entitlements] getEntitlements failed (non-fatal)
Failed to load resource: the server responded with a status of 404 ()
GET [SUPABASE_URL]/rest/v1/user_entitlements?user_id=eq.[USER_ID]&select=... 404 (Not Found)
```

### Technical Details

The app attempts to fetch user entitlements during onboarding progression:
- **File**: `./lib/supabase/client.js:678`
- **Endpoint**: `/rest/v1/user_entitlements?user_id=eq.${userId}&select=user_id,free_scans_used,free_scan_limit,lifetime_scan_count&limit=1`
- **Result**: 404 Not Found (table doesn't exist)

While the code treats missing entitlements as "non-fatal" for normal app operation, the onboarding flow appears to block when this API call fails.

## Solution

Apply the database migration that creates the `user_entitlements` table.

### Migration File Location

```
./supabase/migrations/003_entitlements_and_trigger.sql
```

**Also required for food scan limits:** Apply `005_food_scan_entitlements.sql` to add `free_food_scans_used` and the `allocate_food_scan` RPC. Without it, food scans will be blocked.

This migration creates:
1. `public.user_entitlements` table with columns:
   - `user_id` (uuid, PRIMARY KEY, references auth.users)
   - `free_scans_used` (integer, default 0)
   - `free_scan_limit` (integer, default 2)
   - `lifetime_scan_count` (integer, default 0)
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)
2. Row Level Security (RLS) policies allowing users to read their own entitlement data
3. Trigger function `increment_scan_entitlement()` that updates counters when scans are inserted
4. Index on `user_id` for performance

### How to Apply

**Option 1: Using Supabase Dashboard**
1. Log in to https://supabase.com/dashboard
2. Select your project
3. Navigate to SQL Editor
4. Copy the contents of `./supabase/migrations/003_entitlements_and_trigger.sql`
5. Paste and run the SQL

**Option 2: Using Supabase CLI** (if installed)
```bash
# Ensure you have the service role key set
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Link to the remote project
supabase link --project-ref [YOUR_PROJECT_REF]

# Apply migrations
supabase db push
```

**Option 3: Direct SQL Execution via psql** (if you have database credentials)
```bash
psql [YOUR_DATABASE_CONNECTION_STRING] \
  -f ./supabase/migrations/003_entitlements_and_trigger.sql
```

## Current Environment Status

- **Supabase URL**: ✓ (configured in `.env.local`)
- **Supabase Anon Key**: ✓ (configured in `.env.local`)
- **Supabase Service Role Key**: ✗ (empty in `.env.local`)
- **Supabase CLI**: ✗ (not installed in this environment)

## Dependencies

This migration may depend on earlier migrations:
- `001_extend_scans.sql`
- `002_subscriptions.sql`

Ensure these are also applied to the database in order.

## Post-Migration Testing

After applying the migration:
1. Reload the app at `http://localhost:3000/app`
2. Log in with: `testuser-agent@massiq-test.com` / `TestPass123!`
3. Complete the onboarding flow
4. Verify that clicking "Continue →" on the stats screen advances to the Activity level selection
5. Check browser console - the 404 error for `/rest/v1/user_entitlements` should no longer appear

## Additional Context

The application code has defensive handling for missing entitlements in most places (see `./components/MassIQ.jsx:6567`), but the onboarding flow's stats submission appears to block when this API call fails, preventing users from completing account setup.
