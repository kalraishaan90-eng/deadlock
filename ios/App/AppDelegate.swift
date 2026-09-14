import UIKit
import FirebaseCore
import GoogleSignIn

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // 1. Initialize Firebase with GoogleService-Info.plist
        FirebaseApp.configure()

        // 2. Set up root window and view controller
        window = UIWindow(frame: UIScreen.main.bounds)
        let viewController = ViewController()
        window?.rootViewController = viewController
        window?.makeKeyAndVisible()

        return true
    }

    // 3. Handle Google OAuth redirect URL via REVERSED_CLIENT_ID scheme
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        var handled = false

        // Handle Google Sign-In redirect
        if GIDSignIn.sharedInstance.handle(url) {
            handled = true
        }

        // Notify WKWebView web application of the OAuth callback if needed
        if let rootVC = window?.rootViewController as? ViewController {
            rootVC.handleDeepLink(url: url)
        }

        return handled
    }
}
