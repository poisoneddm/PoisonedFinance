Feature: Monthly goal configuration

  Background:
    Given a seeded user

  Scenario: Default goals are auto-seeded as 40/20/40 for a new month
    When I request goals for June 2026 for the first time
    Then the response has needs_pct 40, wants_pct 20, savings_pct 40

  Scenario: Auto-seeding is idempotent — requesting twice creates exactly one row
    When I request goals for July 2026
    And I request goals for July 2026 again
    Then there is exactly 1 goal row for July 2026

  Scenario: User can update goal percentages that sum to 100
    When I PUT goals for May 2026 with needs_pct 50, wants_pct 10, savings_pct 40
    Then the response status is 200
    And the stored goals are needs_pct 50, wants_pct 10, savings_pct 40

  Scenario: Goal goal amounts are derived from income and percentages
    Given income for May 2026 is 320000 pence
    And the May 2026 goals are needs_pct 40, wants_pct 20, savings_pct 40
    When I request the dashboard for May 2026
    Then the needs goal_pence is 128000
    And the wants goal_pence is 64000
    And the savings goal_pence is 128000

  Scenario: Goal update rejected when percentages do not sum to 100
    When I PUT goals for May 2026 with needs_pct 50, wants_pct 30, savings_pct 30
    Then the response status is 400
    And the existing goals are unchanged

  Scenario: Goal update rejected when a percentage is negative
    When I PUT goals for May 2026 with needs_pct -10, wants_pct 60, savings_pct 50
    Then the response status is 400
