Feature: Login flow smoke test

  Scenario: User logs in with valid credentials
    Given I launch the app
    When I enter "demo_user" into field "login-username"
    And I enter "demo_password" into field "login-password"
    And I tap the element with accessibility id "login-submit"
    Then I assert the text "Welcome" is visible
    And I take a screenshot named "login-success"
