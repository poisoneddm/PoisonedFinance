Feature: Review Queue and Rule Creation
  As the app user
  I want to confirm or correct AI category suggestions
  So that my transactions are accurately categorised and future ones auto-classified

  Background:
    Given the seed user "00000000-0000-0000-0000-000000000001" exists
    And the category "Groceries" with meta_bucket "needs" exists
    And the category "Shopping" with meta_bucket "wants" exists
    And the category "Eating Out" with meta_bucket "wants" exists

  # ── Confirm (POST /review/:txnId/confirm) ───────────────────────────────────

  Scenario: Confirming an AI suggestion sets source=confirmed and needs_review=false
    Given a transaction "txn-confirm-01" with categorisation_source "ai" and needs_review true
    And its suggested category_name is "Shopping"
    When I POST to "/review/txn-confirm-01/confirm"
    Then the transaction "txn-confirm-01" has categorisation_source "confirmed"
    And the transaction "txn-confirm-01" has needs_review false

  Scenario: Confirm returns 200 ok
    Given a transaction "txn-confirm-02" with categorisation_source "ai" and needs_review true
    When I POST to "/review/txn-confirm-02/confirm"
    Then the response status is 200
    And the response body contains "ok": true

  # ── Change (POST /review/:txnId/change) ─────────────────────────────────────

  Scenario: Changing a category sets source=manual and needs_review=false
    Given a transaction "txn-change-01" with categorisation_source "ai" and needs_review true
    And its suggested category_name is "Shopping"
    When I POST to "/review/txn-change-01/change" with body
      """
      { "category_name": "Groceries" }
      """
    Then the transaction "txn-change-01" has categorisation_source "manual"
    And the transaction "txn-change-01" has needs_review false
    And the transaction "txn-change-01" has category_name "Groceries"

  Scenario: Change returns 404 when category_name is not found
    Given a transaction "txn-change-02" with categorisation_source "ai" and needs_review true
    When I POST to "/review/txn-change-02/change" with body
      """
      { "category_name": "DoesNotExist" }
      """
    Then the response status is 404

  # ── Rule creation uses MERCHANT NAME, never old category ────────────────────

  Scenario: Creating a rule on change uses the normalised MERCHANT NAME as the pattern
    Given a transaction "txn-rule-merchant-01" with
      | merchant_name          | AMAZON MKTPLACE  |
      | description            | AMAZON MKTPLACE PMTS |
      | categorisation_source  | ai               |
      | category_name          | Shopping         |
      | needs_review           | true             |
    When I POST to "/review/txn-rule-merchant-01/change" with body
      """
      {
        "category_name": "Groceries",
        "create_rule": true,
        "user_id": "00000000-0000-0000-0000-000000000001"
      }
      """
    Then a categorisation_rule is inserted with merchant_pattern "AMAZON MKTPLACE"
    And the categorisation_rule merchant_pattern is NOT "Shopping"
    And the categorisation_rule merchant_pattern is NOT "Groceries"
    And the categorisation_rule merchant_pattern is NOT "ai"

  Scenario: Rule pattern equals normalised merchant — not old nor new category name
    Given a transaction "txn-rule-merchant-02" with
      | merchant_name         | sainsburys local |
      | description           | POS PURCHASE     |
      | categorisation_source | ai               |
      | category_name         | Shopping         |
      | needs_review          | true             |
    When I POST to "/review/txn-rule-merchant-02/change" with body
      """
      {
        "category_name": "Groceries",
        "create_rule": true,
        "user_id": "00000000-0000-0000-0000-000000000001"
      }
      """
    Then a categorisation_rule is inserted with merchant_pattern "SAINSBURYS LOCAL"
    And the categorisation_rule merchant_pattern is NOT "Shopping"
    And the categorisation_rule merchant_pattern is NOT "Groceries"

  Scenario: Rule falls back to normalised description when merchant_name is null
    Given a transaction "txn-rule-desc-01" with
      | merchant_name         | NULL            |
      | description           | direct debit bt |
      | categorisation_source | ai              |
      | category_name         | Shopping        |
      | needs_review          | true            |
    When I POST to "/review/txn-rule-desc-01/change" with body
      """
      {
        "category_name": "Bills & Utilities",
        "create_rule": true,
        "user_id": "00000000-0000-0000-0000-000000000001"
      }
      """
    Then a categorisation_rule is inserted with merchant_pattern "DIRECT DEBIT BT"

  Scenario: No rule is created when create_rule is false
    Given a transaction "txn-norule-01" with categorisation_source "ai" and needs_review true
    When I POST to "/review/txn-norule-01/change" with body
      """
      { "category_name": "Groceries", "create_rule": false }
      """
    Then no categorisation_rule is inserted

  # ── Review queue LEFT JOIN — uncategorised transactions still appear ─────────

  Scenario: Transactions with NULL category_id still appear in the review queue
    Given a transaction "txn-null-cat-01" with
      | category_id           | NULL |
      | needs_review          | true |
      | categorisation_source | NULL |
    When I GET "/review/00000000-0000-0000-0000-000000000001"
    Then the response contains a transaction with id "txn-null-cat-01"
    And that transaction's category_name is "Uncategorised"

  Scenario: Review queue uses LEFT JOIN so AI-failed transactions are not silently dropped
    Given 3 transactions with needs_review true and category_id NULL
    And 2 transactions with needs_review true and a valid category_id
    When I GET "/review/00000000-0000-0000-0000-000000000001"
    Then the response contains 5 transactions total
