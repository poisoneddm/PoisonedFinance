Feature: AI Categorisation Fallback
  As the PoisonedFinance system
  I want unmatched transactions sent to Claude in batches
  So that every transaction gets a category suggestion without manual effort

  Background:
    Given the seed user "00000000-0000-0000-0000-000000000001" exists
    And the category list contains "Groceries", "Shopping", "Eating Out", "Transport",
      "Fuel", "Bills & Utilities", "Health", "Subscriptions", "Entertainment",
      "Travel", "Savings"

  # ── Batching ─────────────────────────────────────────────────────────────────

  Scenario: Unmatched transactions are sent to Claude in chunks of 40
    Given 85 unmatched transactions exist for user "00000000-0000-0000-0000-000000000001"
    And no categorisation rules match any of them
    When the categorisation pipeline runs for user "00000000-0000-0000-0000-000000000001"
    Then Claude's messages.create was called exactly 3 times
    And the first call contained 40 transactions
    And the second call contained 40 transactions
    And the third call contained 5 transactions

  Scenario: Exactly 40 transactions produces a single Claude call
    Given 40 unmatched transactions exist for user "00000000-0000-0000-0000-000000000001"
    When the categorisation pipeline runs for user "00000000-0000-0000-0000-000000000001"
    Then Claude's messages.create was called exactly 1 time

  # ── AI result fields ─────────────────────────────────────────────────────────

  Scenario: AI result sets source=ai and needs_review=true
    Given 2 unmatched transactions exist for user "00000000-0000-0000-0000-000000000001"
      | id     | merchant_name   | description             |
      | txn-a1 | AMAZON MKTPLACE | AMAZON MKTPLACE PMTS    |
      | txn-a2 | McDonald's      | MCDONALDS               |
    And Claude returns categories
      | id     | category  |
      | txn-a1 | Shopping  |
      | txn-a2 | Eating Out|
    When the categorisation pipeline runs for user "00000000-0000-0000-0000-000000000001"
    Then the transaction "txn-a1" has categorisation_source "ai"
    And the transaction "txn-a1" has needs_review true
    And the transaction "txn-a2" has categorisation_source "ai"
    And the transaction "txn-a2" has needs_review true

  Scenario: Claude is called with the merchant name where available, else description
    Given an unmatched transaction with merchant_name "TESCO STORES" and description "POS PURCHASE"
    When batchCategorise is called
    Then the Claude prompt contains "TESCO STORES"
    And the Claude prompt does not use "POS PURCHASE" as the merchant field for that transaction

  Scenario: Category names from the DB are passed as the enum constraint to Claude
    When batchCategorise is called with any transactions
    Then the tool input_schema enum for the category field equals the list of category names from the DB

  # ── Failed chunk resilience ───────────────────────────────────────────────────

  @wip
  Scenario: A failed Claude chunk leaves those transactions uncategorised but still needs_review=true
    Given 45 unmatched transactions exist for user "00000000-0000-0000-0000-000000000001"
    And Claude's first call (chunk of 40) succeeds with valid categories
    And Claude's second call (chunk of 5) throws a network error
    When the categorisation pipeline runs for user "00000000-0000-0000-0000-000000000001"
    Then the 40 transactions from the first chunk have categorisation_source "ai"
    And the 5 transactions from the failed chunk have category_id NULL
    And the 5 transactions from the failed chunk have needs_review true

  @wip
  Scenario: A failed chunk does not abort categorisation of subsequent chunks
    Given 85 unmatched transactions exist for user "00000000-0000-0000-0000-000000000001"
    And Claude's second call (chunk of 40) throws an error
    When the categorisation pipeline runs for user "00000000-0000-0000-0000-000000000001"
    Then the first chunk of 40 transactions are categorised
    And the third chunk of 5 transactions are categorised
    And only the second chunk of 40 transactions remains uncategorised
