Feature: Transaction sync from TrueLayer

  Background:
    Given a seeded user with a bank connection exists

  Scenario: transaction_date uses meta.transaction_time when present
    When a transaction syncs with timestamp "2026-05-31T10:00:00Z" and meta.transaction_time "2026-05-30T08:00:00Z"
    Then it is stored with transaction_date "2026-05-30" and posted_date "2026-05-31"

  Scenario: transaction_date falls back to timestamp when meta is absent
    When a transaction syncs with timestamp "2026-05-31T10:00:00Z" and no meta.transaction_time
    Then it is stored with transaction_date "2026-05-31" and posted_date "2026-05-31"

  Scenario: Debit amount is stored as negative integer pence
    When a debit transaction syncs with amount -67.42
    Then it is stored with amount_pence -6742

  Scenario: Credit amount is stored as positive integer pence
    When a credit transaction syncs with amount 3200.00
    Then it is stored with amount_pence 320000

  Scenario: Duplicate external_id is not re-inserted on re-sync
    Given a transaction with external_id "txn-001" already exists
    When the sync runs again with the same external_id "txn-001"
    Then there is still exactly 1 row with external_id "txn-001"

  Scenario: New transactions are marked needs_review true after sync
    When 3 new transactions are synced
    Then all 3 transactions have needs_review = true

  Scenario: All monthly aggregations use transaction_date not posted_date
    Given a transaction with transaction_date "2026-04-30" and posted_date "2026-05-01"
    When spending for May 2026 is calculated
    Then that transaction is excluded from May totals
    And that transaction is included in April totals
