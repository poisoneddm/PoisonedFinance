@wip
Feature: Bank statement import (PDF, CSV, OFX)

  Background:
    Given a seeded user

  Scenario: Standard debit line is parsed correctly
    Given a PDF containing the line "15/05/2026  TESCO STORES       54.20"
    When the PDF is uploaded
    Then 1 transaction is imported with transaction_date "2026-05-15", description "TESCO STORES", amount_pence -5420

  Scenario: Credit line with CR suffix is parsed as positive
    Given a PDF containing the line "20/05/2026  SALARY PAYMENT     3200.00 CR"
    When the PDF is uploaded
    Then 1 transaction is imported with amount_pence 320000

  Scenario: DD MMM YYYY date format is parsed
    Given a PDF containing the line "01 May 2026  AMAZON MKTPLACE   34.99"
    When the PDF is uploaded
    Then 1 transaction is imported with transaction_date "2026-05-01"

  Scenario: Junk lines (no recognisable date+amount) are ignored
    Given a PDF containing:
      | line                                  |
      | Account Statement May 2026            |
      | 15/05/2026  TESCO STORES      54.20   |
      | Sort Code: 12-34-56                   |
    When the PDF is uploaded
    Then exactly 1 transaction is imported

  Scenario: All imported transactions are marked needs_review true
    Given a PDF with 2 transaction lines
    When the PDF is uploaded
    Then both transactions have needs_review = true

  Scenario: transaction_date and posted_date are both set to the parsed date
    Given a PDF containing the line "15/05/2026  TESCO STORES       54.20"
    When the PDF is uploaded
    Then the transaction has transaction_date "2026-05-15" and posted_date "2026-05-15"

  Scenario: Duplicate upload does not re-insert the same transaction
    Given a transaction from "2026-05-15" with description "TESCO STORES" and amount -54.20 was already imported
    When the same PDF is uploaded again
    Then there is still exactly 1 row for that transaction

  Scenario: Imported transactions are queued for categorisation pipeline
    Given a PDF with 1 transaction line
    When the upload completes
    Then the categorisation pipeline runs on the new transaction ID

  Scenario: NatWest online transactions PDF is parsed using the running balance
    Given a NatWest transactions PDF with a £0.10 row whose balance falls from £3,941.54 to £3,941.44
    When the PDF is uploaded
    Then 1 transaction is imported with amount_pence -10

  Scenario: NatWest CSV export is imported
    Given a NatWest CSV export with 102 transactions for account 600513-17924995
    When the CSV is uploaded
    Then 102 transactions are imported into the linked account "statement:600513-17924995"

  Scenario: NatWest OFX export is imported
    Given a NatWest OFX export with 102 transactions
    When the OFX file is uploaded
    Then 102 transactions are imported

  Scenario: The same period imported in a second format is not duplicated
    Given the September PDF statement was already imported
    When the September CSV export is uploaded
    Then 0 new transactions are imported
