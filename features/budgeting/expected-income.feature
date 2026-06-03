Feature: Expected income drives budget targets

  Budget targets are computed from EXPECTED income so the plan is stable from day
  one of the month, rather than tracking actual income as salaries land. Expected
  income is a user-confirmed override, else a history-derived suggestion, else
  this month's actual income (cold start).

  Background:
    Given a seeded user

  Scenario: With no history and no override, expected income falls back to this month's actual
    Given actual income of 320000 pence in May 2026
    When I request income for May 2026
    Then the expected income is 320000 with source "actual"

  Scenario: Expected income is suggested from the trailing months' average
    Given actual income of 300000 pence in February 2026
    And actual income of 360000 pence in March 2026
    And actual income of 300000 pence in April 2026
    When I request income for May 2026
    Then the expected income is 320000 with source "suggested"

  Scenario: A confirmed override is used and reported as confirmed
    When I set expected income for May 2026 to 500000 pence
    Then the expected income is 500000 with source "confirmed"

  Scenario: Budget goal amounts derive from expected income
    When I set expected income for May 2026 to 320000 pence
    And I request the dashboard for May 2026
    Then the needs goal_pence is 128000
    And the savings goal_pence is 128000

  Scenario: Clearing the override returns to the suggested figure
    Given actual income of 300000 pence in April 2026
    And I set expected income for May 2026 to 999900 pence
    When I clear the expected income override for May 2026
    Then the expected income is 300000 with source "suggested"
