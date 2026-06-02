Feature: Dashboard pill status colours

  # Needs/Wants: spend buckets — lower is better.
  # ratio = amount_pence / goal_pence
  # ratio < 0.5   → green
  # 0.5 ≤ ratio < 1.0 → amber
  # ratio ≥ 1.0   → red
  #
  # Savings: reversed — higher is better.
  # ratio ≥ 0.9   → green
  # 0.5 ≤ ratio < 0.9 → amber
  # ratio < 0.5   → red

  Scenario Outline: Needs pill status by spend ratio
    Given the monthly needs goal is 100000 pence
    When needs spending is <spent_pence> pence
    Then the needs pill status is "<status>"

    Examples:
      | spent_pence | status |
      | 0           | green  |
      | 49999       | green  |
      | 50000       | amber  |
      | 99999       | amber  |
      | 100000      | red    |
      | 120000      | red    |

  Scenario Outline: Wants pill status by spend ratio
    Given the monthly wants goal is 100000 pence
    When wants spending is <spent_pence> pence
    Then the wants pill status is "<status>"

    Examples:
      | spent_pence | status |
      | 0           | green  |
      | 49999       | green  |
      | 50000       | amber  |
      | 99999       | amber  |
      | 100000      | red    |

  Scenario Outline: Savings pill status is reversed — higher is better
    Given the monthly savings goal is 100000 pence
    When savings amount is <saved_pence> pence
    Then the savings pill status is "<status>"

    Examples:
      | saved_pence | status |
      | 0           | red    |
      | 49999       | red    |
      | 50000       | amber  |
      | 89999       | amber  |
      | 90000       | green  |
      | 100000      | green  |
      | 120000      | green  |

  Scenario: Needs pill is red when goal is zero and there is any spending
    Given the monthly needs goal is 0 pence
    When needs spending is 1 pence
    Then the needs pill status is "red"

  Scenario: Savings pill is green when goal is zero and savings is zero
    Given the monthly savings goal is 0 pence
    When savings amount is 0 pence
    Then the savings pill status is "green"
