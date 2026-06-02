@wip
Feature: Savings forecast tiers

  # Formulas (all values in pence/month):
  #   goal_pence      = ROUND(income_this_month × savings_pct / 100)
  #   actual_pence    = savings bucket spend this month
  #   realistic_pence = max(0, ROUND(avg6_income - avg6_needs - avg6_wants))
  #   stretch_pence   = max(0, ROUND(avg6_income - avg6_needs - 0.70 × avg6_wants))
  #   annual_pence(t) = t × 12
  #
  #   badge: tier ≥ goal → "on-track"; tier < goal → "behind"; Stretch always "stretch"

  Background:
    Given a seeded user with income of 320000 pence in May 2026
    And the savings goal is 40% (goal_pence = 128000)

  Scenario: Goal tier is 40% of this month's income
    When I request the forecast for May 2026
    Then the Goal tier monthly_pence is 128000
    And the Goal tier annual_pence is 1536000

  Scenario: Realistic tier uses 6-month average income minus average needs and wants
    Given 6-month averages: income 320000, needs 120000, wants 50000
    When I request the forecast for May 2026
    Then the Realistic tier monthly_pence is 150000
    And the Realistic badge is "on-track"

  Scenario: Realistic tier is "behind" when below goal
    Given 6-month averages: income 320000, needs 160000, wants 80000
    When I request the forecast for May 2026
    Then the Realistic tier monthly_pence is 80000
    And the Realistic badge is "behind"

  Scenario: Stretch tier reduces wants spend by 30%
    Given 6-month averages: income 320000, needs 120000, wants 50000
    When I request the forecast for May 2026
    Then the Stretch tier monthly_pence is 165000
    And the Stretch badge is "stretch"

  Scenario: Realistic and Stretch tier clamp to zero when spend exceeds income
    Given 6-month averages: income 200000, needs 150000, wants 80000
    When I request the forecast for May 2026
    Then the Realistic tier monthly_pence is 0
    And the Stretch tier monthly_pence is 0

  Scenario: Actual tier is savings moved this month
    Given savings transactions in May 2026 total 45000 pence
    When I request the forecast for May 2026
    Then the Actual tier monthly_pence is 45000
    And the Actual tier annual_pence is 540000
    And the Actual badge is "behind"

  Scenario: Fewer than 6 months of history averages over available months
    Given only 3 months of transaction history exist
    When I request the forecast
    Then the Realistic and Stretch tiers are computed over those 3 months without error

  Scenario: Response includes all 4 tiers in order Goal, Realistic, Stretch, Actual
    When I request the forecast for May 2026
    Then the tiers are returned in the order Goal, Realistic, Stretch, Actual
