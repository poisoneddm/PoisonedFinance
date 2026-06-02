@wip
Feature: Spending trend callouts

  Background:
    Given a seeded user

  Scenario: Consistent-spend callout when a category is stable over 6 months
    Given Groceries monthly spend over 6 months is 41000, 41500, 42000, 41800, 42100, 42300 pence
    When I request forecast trends
    Then a "consistent" callout exists for Groceries

  Scenario: Increasing-spend callout when a category rises more than 10% over 3 months
    Given Eating Out spend 3 months ago was 15800 pence, 2 months ago 16800 pence, last month 18700 pence
    When I request forecast trends
    Then an "increasing" callout exists for Eating Out
    And the callout shows old_pence 15800 and new_pence 18700

  Scenario: No increasing callout when a category rises 10% or less over 3 months
    Given Eating Out spend 3 months ago was 15800 pence, 2 months ago 16000 pence, last month 17000 pence
    When I request forecast trends
    Then no "increasing" callout exists for Eating Out

  Scenario: Saving-suggestion callout shows how much reducing to 3-month average saves
    Given Eating Out 3-month average is 15800 pence and current month is 18700 pence
    When I request forecast trends
    Then a "suggestion" callout exists for Eating Out
    And the suggestion saving_pence is approximately 2900

  Scenario: No suggestion callout when current month is at or below 3-month average
    Given Eating Out 3-month average is 18700 pence and current month is 18700 pence
    When I request forecast trends
    Then no "suggestion" callout exists for Eating Out

  Scenario: Response is an array (may be empty when no notable trends exist)
    Given a user with only 1 month of transaction history
    When I request forecast trends
    Then the trends response is an array
