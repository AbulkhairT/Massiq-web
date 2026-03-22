# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

MassIQ is an AI-powered body composition intelligence platform. The primary application is in `massiq-2/` (Next.js 15, App Router). A secondary skeleton React Native app in `massiq-native/` is not functional and can be ignored.

### Running the app

- **Dev server:** `npm run dev` from `massiq-2/` — runs on port 3000.
- **Build:** `npm run build` from `massiq-2/`.
- **Lint:** No ESLint config exists in the repo. Running `npm run lint` (`next lint`) triggers an interactive setup wizard; avoid in non-interactive contexts.
- **Tests:** No test framework or test scripts are configured.

### Environment variables

A `.env.local` file is needed in `massiq-2/`. The app degrades gracefully:
- Without `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: no auth or data persistence (login UI renders but calls fail).
- Without `ANTHROPIC_API_KEY`: the `/api/engine` route still returns deterministic physiology calculations (no AI narrative). The `/api/anthropic` and `/api/claude` routes return 500.
- Without Stripe keys: premium/billing features are non-functional; core app works.

### Key architecture notes

- The Supabase client (`lib/supabase/client.js`) is a custom REST wrapper using raw `fetch()` — no `@supabase/supabase-js` SDK.
- The intelligence engine (`lib/engine/`) is fully deterministic TypeScript — no AI dependency. It expects properly cased enum values (e.g. `'Cut'`, `'Bulk'`, `'Recomp'`, `'Maintain'` for goal).
- Only 4 runtime npm dependencies: `next`, `react`, `react-dom`, `stripe`.

### Gotchas

- `npm run lint` is interactive and will block in CI/headless environments. Use `npx eslint .` if an `.eslintrc` is added in the future.
- The `massiq-native/` app references an `App` component that doesn't exist — it cannot run.
