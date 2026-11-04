import FirebaseCore
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Must run before any JS code touches @react-native-firebase/* (e.g. via
    // getAuth()), otherwise it throws "No Firebase App '[DEFAULT]' has been
    // created". Unlike Android (auto-configured by the Google Services
    // Gradle plugin), iOS needs this explicit call.
    FirebaseApp.configure()
    return true
  }
}
