Feature: Monthly spending bucket aggregation

  Background:
    Given a seeded user
    And the following May 2026 transactions exist:
      | merchant         | category          | amount_pence |
      | Tesco Superstore | Groceries         | -42130       |
      | British Gas      | Bills & Utilities | -31200       |
      | Tesco Petrol     | Fuel              | -5400        |
      | Pret A Manger    | Eating Out        | -18750       |
      | Spotify          | Subscriptions     | -1199        |
      | NatWest Saver    | Savings           | -30000       |
      | Employer         | null              | 320000       |

  Scenario: Needs bucket is the sum of debit Groceries, Bills, Fuel, Transport, Health
    When I request spending for May 2026
    Then the needs total_pence is 78730

  Scenario: Wants bucket is the sum of debit Eating Out, Shopping, Subscriptions, Entertainment, Travel
    When I request spending for May 2026
    Then the wants total_pence is 19949

  Scenario: Savings bucket is money moved to the Savings category
    When I request spending for May 2026
    Then the savings total_pence is 30000

  Scenario: Income is the sum of credit transactions excluding Savings
    When I request income for May 2026
    Then income_pence is 320000

  # @wip — DIVERGENCE: the expected 73730 implies a +5000 refund nets against
  # bucket spend, but the implemented (and unit-tested) contract is debit-only
  # (amount_pence < 0), so the refund is ignored and needs stays 78730. Netting
  # refunds is a budgeting-math product decision, not implemented here.
  @wip
  Scenario: Only debit amounts (negative) count toward bucket spend
    Given a credit refund from Tesco of amount_pence +5000 categorised as Groceries in May 2026
    When I request spending for May 2026
    Then the needs total_pence is 73730

  Scenario: transaction_date boundary — transaction posted in May but dated April is excluded
    Given a transaction with transaction_date "2026-04-30" and posted_date "2026-05-01" categorised as Groceries
    When I request spending for May 2026
    Then the needs total_pence does not include that transaction
    And when I request spending for April 2026 it IS included

  Scenario: Uncategorised transactions do not contribute to any bucket
    Given a transaction with amount_pence -5000 and no category in May 2026
    When I request spending for May 2026
    Then the needs, wants, and savings totals are unchanged
