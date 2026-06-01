# PoisonedFinance — Design Spec
_2026-06-01_

## Overview

A personal finance app that aggregates UK bank accounts via Open Banking (TrueLayer), auto-categorises transactions using a rules engine + Claude API, and tracks spending against a 40/20/40 Needs/Wants/Savings budget.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Mobile frontend | React Native (Expo) |
| Backend | Node.js / TypeScript monolith |
| Database | PostgreSQL |
| Open Banking | TrueLayer (NatWest, Halifax, Monzo) |
| AI categorisation | Claude API (batch) |
| Hosting | Fly.io free tier |

---

## Screens

Six screens, as prototyped in `mockup/index.html`:

1. **Dashboard** — monthly income card, Needs/Wants/Savings pills, review-queue alert, recent transactions
2. **Spending** — goal progress bars (all 3 buckets) + category breakdown grouped by meta-bucket
3. **Forecast** — savings tiers (Goal / Realistic / Stretch / Actual) + spending trend callouts
4. **Transactions** — searchable, filterable full transaction list
5. **Review Queue** — AI-suggested categories awaiting user confirmation
6. **Category Edit** — pick a new category for a transaction + optional rule creation

---

## Data Model (key decisions)

### Transactions
- Store both `transaction_date` and `posted_date`
- All analysis (budgets, forecasts, category totals) uses `transaction_date`

### Categories & Meta-buckets

| Category | Meta-bucket |
|---|---|
| Groceries | Needs |
| Transport | Needs |
| Fuel | Needs |
| Bills & Utilities | Needs |
| Health | Needs |
| Eating Out | Wants |
| Shopping | Wants |
| Subscriptions | Wants |
| Entertainment | Wants |
| Travel | Wants |
| Savings | Savings |

### Goals (defaults)
- **Needs**: 40% of income
- **Wants**: 20% of income
- **Savings**: 40% of income

User can override percentages per month.

---

## Categorisation Pipeline

```
New transactions
      │
      ▼
Rules engine (merchant-name exact match)
      │  match → apply category, source = "rule"
      │  no match
      ▼
Claude API batch categorisation
      │  source = "ai"
      ▼
Review Queue (user confirms or changes)
      │  confirmed → source = "confirmed"
      │  changed   → source = "manual" + create rule
      ▼
Final category stored
```

### Rule creation on correction
When a user changes a category in the Category Edit screen, a rule-suggestion prompt appears:

> Save rule: always categorise **AMAZON** as Shopping?

- The merchant name shown is **always the raw merchant string from the transaction** — never the old/previous category name.
- If accepted, a new rule is written: `merchant_name = "AMAZON MKTPLACE" → Shopping`.
- Rules are normalised (uppercased, trimmed) before matching.

---

## Dashboard Pills — Status Colours

Pills show dim background colours to avoid false urgency.

### Needs & Wants (spend buckets — lower is better)

| Spend vs goal | Background | Text colour |
|---|---|---|
| < 50% | dim green (`#0d2e1a`) | green |
| 50–99% | dim amber (`#2d2208`) | amber |
| ≥ 100% (over) | dim red (`#2d0a0a`) | red |

### Savings (reversed — higher is better)

| Saved vs goal | Background | Text colour |
|---|---|---|
| < 50% | dim red (`#2d0a0a`) | red |
| 50–89% | dim amber (`#2d2208`) | amber |
| ≥ 90% | dim green (`#0d2e1a`) | green |

---

## Spending Screen

Shows all three goal progress bars (Needs, Wants, Savings) at the top, then category breakdown below, grouped by meta-bucket with coloured section headers.

---

## Savings Forecast Screen

Four tiers displayed as cards:

| Tier | Definition |
|---|---|
| Goal | 40% of income (user target) |
| Realistic | Projected savings based on 6-month spend trends |
| Stretch | Savings if Wants spending cut by 30% |
| Actual | Savings transferred/moved this month so far |

Each tier shows monthly amount, projected annual amount, and a badge (on-track / behind / stretch).

Trend callouts below the tiers highlight notable patterns (consistent spend, increasing categories, saving suggestions).

---

## Sync

- **Primary**: Monthly sync via TrueLayer webhook / pull
- **Fallback**: PDF statement upload (manual parsing)

---

## Implementation Phases (proposed)

### Phase 1 — Repo & Tooling
- [x] Interactive HTML mockup (`mockup/index.html`)
- [x] `.claude/settings.json` + `session-start.sh` hook
- [ ] `docs/superpowers/specs/` design spec (this file)

### Phase 2 — Backend Scaffold
- Expo app skeleton (bottom nav, 6 screen stubs)
- Node.js/TS project with PostgreSQL schema
- TrueLayer OAuth + account/transaction sync
- Categorisation pipeline (rules engine + Claude API batch)

### Phase 3 — Core Features
- Dashboard, Spending, Transactions screens wired to real data
- Review Queue + Category Edit with rule creation
- Goal configuration

### Phase 4 — Forecast & Polish
- Savings forecast (3 tiers + actuals)
- Trend analysis callouts
- Fly.io deployment
