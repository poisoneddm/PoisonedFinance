Feature: Categorisation Rules Engine
  As the PoisonedFinance system
  I want to match transactions against user-defined merchant rules
  So that known merchants are categorised instantly without human review

  Background:
    Given the seed user "00000000-0000-0000-0000-000000000001" exists
    And the category "Groceries" with meta_bucket "needs" exists
    And the category "Shopping" with meta_bucket "wants" exists

  # ── Merchant normalisation ──────────────────────────────────────────────────

  Scenario: Merchant string is uppercased and trimmed before matching
    Given a categorisation rule for user "00000000-0000-0000-0000-000000000001"
      | merchant_pattern | category_name |
      | TESCO STORES     | Groceries     |
    When I call normaliseMerchant with "  tesco stores  "
    Then the normalised merchant is "TESCO STORES"

  Scenario: Null merchant falls back to the transaction description
    When I call normaliseMerchant with merchant null and description "DIRECT DEBIT BT"
    Then the normalised merchant is "DIRECT DEBIT BT"

  Scenario: Description fallback is also uppercased and trimmed
    When I call normaliseMerchant with merchant null and description "  amazon prime  "
    Then the normalised merchant is "AMAZON PRIME"

  # ── Exact-match rule applies ─────────────────────────────────────────────────

  Scenario: Exact-match rule sets source=rule and needs_review=false
    Given a categorisation rule for user "00000000-0000-0000-0000-000000000001"
      | merchant_pattern | category_name |
      | TESCO STORES     | Groceries     |
    And a transaction with merchant_name "Tesco Stores" and external_id "txn-rule-01"
    When the rules engine runs for user "00000000-0000-0000-0000-000000000001"
    Then the transaction "txn-rule-01" has category_name "Groceries"
    And the transaction "txn-rule-01" has categorisation_source "rule"
    And the transaction "txn-rule-01" has needs_review false

  Scenario: Match is case-insensitive due to normalisation
    Given a categorisation rule for user "00000000-0000-0000-0000-000000000001"
      | merchant_pattern | category_name |
      | AMAZON MKTPLACE  | Shopping      |
    And a transaction with merchant_name "  amazon mktplace  " and external_id "txn-rule-02"
    When the rules engine runs for user "00000000-0000-0000-0000-000000000001"
    Then the transaction "txn-rule-02" has categorisation_source "rule"

  Scenario: Rule lookup queries using the normalised merchant name
    Given a categorisation rule for user "00000000-0000-0000-0000-000000000001"
      | merchant_pattern | category_name |
      | AMAZON MKTPLACE  | Shopping      |
    When applyRules is called for user "00000000-0000-0000-0000-000000000001" with merchant "  amazon mktplace  "
    Then the DB was queried with parameters including "00000000-0000-0000-0000-000000000001" and "AMAZON MKTPLACE"

  # ── No-match fall-through ────────────────────────────────────────────────────

  Scenario: Unrecognised merchant produces no rule result
    Given no categorisation rules exist for user "00000000-0000-0000-0000-000000000001"
    And a transaction with merchant_name "Unknown Merchant" and external_id "txn-nomatch-01"
    When the rules engine runs for user "00000000-0000-0000-0000-000000000001"
    Then applyRules returns an empty result list

  Scenario Outline: Boundary matching — only exact normalised patterns match
    Given a categorisation rule for user "00000000-0000-0000-0000-000000000001"
      | merchant_pattern | category_name |
      | TESCO STORES     | Groceries     |
    When applyRules is called for user "00000000-0000-0000-0000-000000000001" with merchant "<input>"
    Then applyRules returns <matches> result(s)

    Examples:
      | input        | matches |
      | TESCO STORES | 1       |
      | tesco stores | 1       |
      | TESCO        | 0       |
      | TESCO STORE  | 0       |
      | TESCO STORESS| 0       |
