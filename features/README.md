# BDD Feature Files

Feature files are written in Gherkin and bound to Jest step-definition files via `jest-cucumber`.

## Directory layout

| Directory | Capability |
|-----------|-----------|
| `features/categorisation/` | Rules engine, AI fallback, review queue |
| `features/sync/` | TrueLayer OAuth, transaction sync, PDF import |
| `features/budgeting/` | Spending buckets, dashboard pills, goal config |
| `features/forecast/` | Savings forecast tiers, spending trend callouts |

## @wip convention

Scenarios tagged `@wip` are NOT yet implemented. They are skipped in CI
(`tagFilter: 'not @wip'`) but remain in source as living specifications.
Remove the `@wip` tag from a scenario when its step definitions are written
and passing.

## Step-definition locations

| Feature file | Step file |
|---|---|
| `features/categorisation/rules-engine.feature` | `api/src/__tests__/features/categorisation/rules-engine.steps.ts` |
| `features/budgeting/dashboard-pills.feature` | `mobile/__tests__/features/budgeting/dashboard-pills.steps.ts` |
| *(all others)* | *(to be added as features are implemented)* |
