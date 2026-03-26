# Decision Replay CLI

Runs historical decision replay from existing DB tables:

- `scans`
- `plans`
- `decision_engine_runs`
- `user_body_state_history`
- `decision_replay_runs`
- `decision_replay_cases`

## Usage

```bash
npm run replay:decision -- \
  --user-id <uuid> \
  --date-from 2026-01-01T00:00:00Z \
  --date-to 2026-03-31T23:59:59Z \
  --source-engine-version db-recorded \
  --replay-engine-version stable-v1 \
  --max-cases 100
```

Replay synthetic fixtures instead of DB history:

```bash
npm run replay:decision -- \
  --user-id 00000000-0000-0000-0000-000000000000 \
  --fixture-set synthetic-progressions \
  --replay-engine-version stable-v1 \
  --max-cases 120 \
  --require-nonnull-bf-gap \
  --no-persist
```

Forced-disagreement replay fixture set:

```bash
npm run replay:decision -- \
  --user-id 00000000-0000-0000-0000-000000000000 \
  --fixture-set forced-disagreement \
  --replay-engine-version stable-v1 \
  --require-nonnull-bf-gap \
  --no-persist
```

## Output

- replay schema readiness
- changed case lines with short diffs
- summary counts:
  - total
  - changed
  - improved
  - regressed
  - unchanged

## Notes

- Uses existing replay tables; no table recreation.
- `replay-engine-version` supports:
  - `stable-v1` (default) -> `runDecisionEngineOnStableState`
  - `legacy-v1` -> `runScanDecisionEngine`
- `--fixture-set synthetic-progressions` uses synthetic progression fixtures from
  `scripts/replay/fixtures/synthetic-progressions.json`
- `--require-nonnull-bf-gap` fails if BF + targetBF are present but either gap is null
- `--no-persist` runs locally without writing replay tables
