# MassIQ Evaluation Harness

Run:

`npm run eval:harness`

Strict mode (non-zero exit on any failing fixture):

`npm run eval:harness -- --fail-on-any-fail`

This executes three regression groups:

- body scan stability (signal extraction + stable-state smoothing)
- food scan reasonableness (range extraction + midpoint summarization)
- decision engine consistency (stable-state decision behavior)

Fixture files:

- `scripts/eval/fixtures/body-stability.json`
- `scripts/eval/fixtures/food-reasonableness.json`
- `scripts/eval/fixtures/decision-consistency.json`

Interpretation:

- `PASS` means behavior stayed within expected tolerance or rule.
- `FAIL` means a potential regression or weak heuristic.

Baseline tracking:

- latest run snapshot is saved to `scripts/eval/.baseline/latest.json`
- previous latest is rotated to `scripts/eval/.baseline/previous.json`
- harness reports section-level regressions/improvements vs previous run
