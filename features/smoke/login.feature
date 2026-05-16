Feature: Android settings smoke test

  Scenario: Open settings and confirm Wi-Fi is shown
    Given I launch app with package "com.android.settings"
    When I wait 2 seconds
    And I assert current package is "com.android.settings"
    And I take a screenshot named "settings-opened"
    Then I assert one of texts "Wi-Fi|WLAN|Network & internet|Settings|ネットワークとインターネット" is visible
    And I take a screenshot named "settings-wifi"

  Scenario: Open settings and tap Apps
    Given I launch app with package "com.android.settings"
    When I wait 2 seconds
    And I assert current package is "com.android.settings"
    And I assert one of texts "Apps|App management|Applications|アプリ" is visible
    And I tap one of texts "Apps|App management|Applications|アプリ"
    And I wait 1 second
    Then I assert one of texts "All apps|App info|See all|Default apps|Permissions|アプリ情報" is visible
    And I take a screenshot named "settings-apps"
