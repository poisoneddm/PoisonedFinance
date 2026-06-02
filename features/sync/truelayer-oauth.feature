Feature: TrueLayer OAuth Integration
  As the app user
  I want to link my UK bank accounts via TrueLayer
  So that my transactions are fetched automatically

  Background:
    Given the seed user "00000000-0000-0000-0000-000000000001" exists
    And the TrueLayer environment is configured with
      | TRUELAYER_CLIENT_ID      | test-client-id                        |
      | TRUELAYER_CLIENT_SECRET  | test-secret                           |
      | TRUELAYER_REDIRECT_URI   | http://localhost:3000/auth/callback   |

  # ── Consent redirect ─────────────────────────────────────────────────────────

  Scenario: Consent redirect goes to TrueLayer auth URL
    When I GET "/auth/truelayer?userId=00000000-0000-0000-0000-000000000001"
    Then the response status is 302
    And the Location header contains "auth.truelayer.com"

  Scenario: Consent redirect includes NatWest provider
    When I GET "/auth/truelayer?userId=00000000-0000-0000-0000-000000000001"
    Then the redirect URL providers parameter contains "uk-ob-natwest"

  Scenario: Consent redirect includes Halifax provider
    When I GET "/auth/truelayer?userId=00000000-0000-0000-0000-000000000001"
    Then the redirect URL providers parameter contains "uk-ob-halifax"

  Scenario: Consent redirect includes Monzo provider
    When I GET "/auth/truelayer?userId=00000000-0000-0000-0000-000000000001"
    Then the redirect URL providers parameter contains "uk-monzo"

  Scenario: Consent redirect includes required OAuth scopes
    When I GET "/auth/truelayer?userId=00000000-0000-0000-0000-000000000001"
    Then the redirect URL scope parameter contains "accounts"
    And the redirect URL scope parameter contains "transactions"

  Scenario: Consent redirect encodes userId as the OAuth state parameter
    When I GET "/auth/truelayer?userId=00000000-0000-0000-0000-000000000001"
    Then the redirect URL state parameter starts with "00000000-0000-0000-0000-000000000001"

  Scenario: Missing userId returns 400
    When I GET "/auth/truelayer" with no userId query parameter
    Then the response status is 400

  # ── Callback — stores connection and triggers initial sync ──────────────────

  Scenario: Callback with a valid code stores a bank_connection record
    Given TrueLayer returns tokens for code "auth-code-valid"
      | access_token  | fresh-access-token  |
      | refresh_token | fresh-refresh-token |
      | expires_in    | 3600                |
    When I GET "/auth/callback?code=auth-code-valid&state=00000000-0000-0000-0000-000000000001:abc123"
    Then a bank_connection row is inserted for user "00000000-0000-0000-0000-000000000001"
    And the response status is 200

  Scenario: Callback triggers initial sync after storing the connection
    Given TrueLayer returns tokens for code "auth-code-sync"
    When I GET "/auth/callback?code=auth-code-sync&state=00000000-0000-0000-0000-000000000001:xyz"
    Then syncAccounts was called with the new connection_id
    And syncTransactions was called for each discovered account

  Scenario: Callback with missing code returns 400
    When I GET "/auth/callback?state=00000000-0000-0000-0000-000000000001:abc"
    Then the response status is 400

  Scenario: Callback with missing state returns 400
    When I GET "/auth/callback?code=some-code"
    Then the response status is 400

  # ── Token encryption ─────────────────────────────────────────────────────────

  Scenario: Tokens are stored encrypted — plaintext never appears in the database
    Given TrueLayer returns tokens for code "auth-code-enc"
      | access_token  | plaintext-access-token  |
      | refresh_token | plaintext-refresh-token |
      | expires_in    | 3600                    |
    When I GET "/auth/callback?code=auth-code-enc&state=00000000-0000-0000-0000-000000000001:nonce"
    Then the bank_connection row access_token_enc does not equal "plaintext-access-token"
    And the bank_connection row refresh_token_enc does not equal "plaintext-refresh-token"
    And decrypting access_token_enc yields "plaintext-access-token"

  # ── Token refresh before sync ────────────────────────────────────────────────

  Scenario: An expired access token is refreshed before sync is attempted
    Given a bank_connection exists with token_expires_at 90 seconds in the past
    When a sync is triggered for user "00000000-0000-0000-0000-000000000001"
    Then refreshAccessToken was called with the stored refresh token
    And the bank_connection row is updated with the new encrypted tokens
    And the sync proceeds with the refreshed access token

  Scenario: A token expiring within 60 seconds is treated as expired and refreshed
    Given a bank_connection exists with token_expires_at 30 seconds in the future
    When getValidAccessToken is called for that connection
    Then refreshAccessToken is called
    And the returned token is the new access token

  Scenario: A valid token (more than 60 seconds until expiry) is used without refresh
    Given a bank_connection exists with token_expires_at 300 seconds in the future
    When getValidAccessToken is called for that connection
    Then refreshAccessToken is NOT called
    And the returned token is the decrypted stored access token
