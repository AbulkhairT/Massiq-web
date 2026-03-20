# MassIQ Production QA Checklist (Manual)

> Use this checklist for pre-beta validation across critical user flows.
> Mark each item: [ ] Pass / [ ] Fail / [ ] N/A.

## Test Environment Setup

- [ ] Use a clean browser profile (no existing local storage/session).
- [ ] Test on mobile viewport and desktop viewport.
- [ ] Have at least **2 test accounts**:
  - Account A: verified email
  - Account B: unverified email
- [ ] Confirm Supabase project is reachable and auth keys are correct.

---

## 1) Sign Up (new account)

### Steps
- [ ] Open landing page.
- [ ] Go to auth screen.
- [ ] Select **Create Account**.
- [ ] Enter valid new email + valid password (>= 6 chars).
- [ ] Submit.

### Expected Result
- [ ] Account creation succeeds with clear message/state transition.
- [ ] No crash, no blank screen, no infinite loading.
- [ ] If email confirmation is enabled, user gets explicit verification guidance.

### Failure Symptoms
- [ ] Generic/unclear error despite valid inputs.
- [ ] Session appears created for wrong user.
- [ ] App loops back to auth without explanation.

---

## 2) Sign In (valid credentials)

### Steps
- [ ] Open auth screen.
- [ ] Select **Log In**.
- [ ] Enter verified account credentials.
- [ ] Submit.

### Expected Result
- [ ] User is authenticated.
- [ ] Correct user profile loads (no cross-user leakage).
- [ ] If profile incomplete: onboarding shows.
- [ ] If profile complete + plan exists: Home loads.

### Failure Symptoms
- [ ] Login succeeds then immediately logs out.
- [ ] Another user’s data appears.
- [ ] Spinner stuck or repeated reload.

---

## 3) Wrong Password

### Steps
- [ ] On auth screen, enter valid email + wrong password.
- [ ] Submit.

### Expected Result
- [ ] Inline error shows: invalid credentials / incorrect email or password.
- [ ] User stays logged out.
- [ ] No stale session remains.

### Failure Symptoms
- [ ] Silent failure or generic “something went wrong.”
- [ ] User gets partially logged in.

---

## 4) Unverified Email

### Steps
- [ ] Use unverified account credentials.
- [ ] Attempt sign in.

### Expected Result
- [ ] Clear error for unverified email (confirm email first).
- [ ] No authenticated app state.

### Failure Symptoms
- [ ] Incorrect error message (e.g., wrong password when password is correct).
- [ ] User is let in without verification (if policy requires verification).

---

## 5) Verified Email

### Steps
- [ ] Verify account email externally.
- [ ] Sign in again.

### Expected Result
- [ ] Successful login.
- [ ] Stable authenticated state after navigation/refresh.

### Failure Symptoms
- [ ] Still blocked as unverified.
- [ ] Session invalid loop after success.

---

## 6) Onboarding (Imperial)

### Steps
- [ ] Start onboarding as new user.
- [ ] Choose **imperial** units.
- [ ] Enter valid values (example: 185 lb, 5 ft 10 in, age 30, goal/activity/gender).
- [ ] Complete onboarding.

### Expected Result
- [ ] Validation works inline (no crashes).
- [ ] Profile saves.
- [ ] Plan provisioning runs and completes.
- [ ] Post-onboarding UI shows real persisted plan values.

### Failure Symptoms
- [ ] Mixed units shown (kg + ft/in together).
- [ ] Profile saved but no plan and user lands in broken state.
- [ ] Placeholder values shown as final.

---

## 7) Onboarding (Metric)

### Steps
- [ ] Start onboarding with another new user.
- [ ] Choose **metric** units.
- [ ] Enter valid values (example: 84 kg, 178 cm, age 30).
- [ ] Complete onboarding.

### Expected Result
- [ ] Validation and save succeed.
- [ ] Persisted plan appears consistently.
- [ ] Metric display remains consistent across Home/Profile/Plan.

### Failure Symptoms
- [ ] Unit flips unexpectedly after save.
- [ ] Protein/calories mismatch between screens.

---

## 8) Plan Generation (single source of truth)

### Steps
- [ ] After onboarding completion, inspect Home + Plan pages.
- [ ] Refresh page.
- [ ] Log out, log in again.
- [ ] Re-check plan values.

### Expected Result
- [ ] Same persisted plan values across all surfaces.
- [ ] No duplicate plan records per user.
- [ ] No fallback placeholder plan visible.

### Failure Symptoms
- [ ] Different calories/protein values between pages.
- [ ] Plan disappears after refresh.
- [ ] Duplicate plan rows created.

---

## 9) First Scan (baseline)

### Steps
- [ ] Ensure user has plan and no prior scans.
- [ ] Complete first scan flow.
- [ ] Return to Home.

### Expected Result
- [ ] State becomes baseline scan complete.
- [ ] Baseline messaging shown.
- [ ] No progress-vs-previous metrics yet.

### Failure Symptoms
- [ ] Fake trajectory/progress shown after only one scan.
- [ ] Milestones/adjustments pretend trend exists.

---

## 10) Second Scan (trajectory activation)

### Steps
- [ ] Complete second scan for same user.
- [ ] Return to Home.

### Expected Result
- [ ] Trajectory/progress sections unlock.
- [ ] Decision engine outputs one clear decision.
- [ ] Limiting factor/action/reason/effect are coherent.

### Failure Symptoms
- [ ] Still treated as baseline with 2+ scans.
- [ ] Conflicting recommendations shown simultaneously.

---

## 11) Logout → Login

### Steps
- [ ] From authenticated state, log out.
- [ ] Confirm auth screen.
- [ ] Log in again.

### Expected Result
- [ ] Logout clears active session and app state.
- [ ] Login restores correct user data only.

### Failure Symptoms
- [ ] Previous user’s data appears after another login.
- [ ] “Session expired” loop immediately on auth screen.

---

## 12) Refresh Persistence

### Steps
- [ ] While authenticated, refresh browser on Home.
- [ ] Navigate tabs.
- [ ] Refresh again on Scan/Plan/Profile.

### Expected Result
- [ ] Session and user state remain stable.
- [ ] No missing-plan transient state visible.
- [ ] No crashes.

### Failure Symptoms
- [ ] Redirect to broken intermediate state.
- [ ] Empty/placeholder cards where real data should be.

---

## 13) Reset Flow

### Steps
- [ ] Trigger reset from profile/settings.
- [ ] Confirm reset.
- [ ] Check Home, Plan, Scan, Nutrition.

### Expected Result
- [ ] Reset clears local app data correctly.
- [ ] No stale scans/meals/plan artifacts remain.
- [ ] App returns to expected post-reset state.

### Failure Symptoms
- [ ] Old data still visible after reset.
- [ ] Partial reset (some tabs cleared, others stale).

---

## 14) Invalid / Missing Input Handling

### Steps
- [ ] Try age 0 / negative / >100.
- [ ] Try missing weight/height.
- [ ] Try out-of-range metric/imperial conversions.
- [ ] Attempt onboarding submit with incomplete required fields.

### Expected Result
- [ ] Inline validation errors appear.
- [ ] Submit blocked safely.
- [ ] No runtime exceptions.

### Failure Symptoms
- [ ] UI crash/white screen.
- [ ] NaN or undefined shown in plan/targets.

---

## Cross-Cut Assertions (run across all tests)

- [ ] No placeholder text in production surfaces.
- [ ] No fake countdown/milestones before sufficient scan data.
- [ ] No mixed units per user preference.
- [ ] No duplicated plan rows.
- [ ] No auth/session leakage between users.

---

## Beta Release Blockers (must fix before public beta)

Mark any **YES** as blocker:

- [ ] YES / [ ] NO — Auth allows wrong user/session leakage.
- [ ] YES / [ ] NO — Verified users cannot consistently sign in.
- [ ] YES / [ ] NO — Unverified-email handling is incorrect/ambiguous.
- [ ] YES / [ ] NO — Profile complete but plan missing is visible to users.
- [ ] YES / [ ] NO — Scan can start without a valid plan.
- [ ] YES / [ ] NO — Plan values differ across onboarding/home/plan page.
- [ ] YES / [ ] NO — Fake trajectory/progress shown before second scan.
- [ ] YES / [ ] NO — Any crash in onboarding/auth/scan critical path.
- [ ] YES / [ ] NO — Unit inconsistency (metric/imperial mixed).
- [ ] YES / [ ] NO — Reset/logout leaves stale user data.

If any blocker = YES → **Do not ship public beta**.

---

## Sign-off

- QA Owner: __________________
- Date: ______________________
- Build/Commit: ______________
- Decision: [ ] Ready for private beta  [ ] Ready for public beta  [ ] Not ready
