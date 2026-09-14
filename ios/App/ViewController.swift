import UIKit
import WebKit

class ViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {

    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        loadApplication()
    }

    private func setupWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        // Configure WKPreferences
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences

        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.bounces = false

        view.addSubview(webView)
    }

    private func loadApplication() {
        // Option A: Load local bundled www / web assets
        if let bundlePath = Bundle.main.path(forResource: "www/index", ofType: "html") {
            let fileUrl = URL(fileURLWithPath: bundlePath)
            let dirUrl = fileUrl.deletingLastPathComponent()
            webView.loadFileURL(fileUrl, allowingReadAccessTo: dirUrl)
        } else if let localUrl = URL(string: "http://localhost:3000") {
            // Option B: Load local dev server during simulator / debug runs
            let request = URLRequest(url: localUrl)
            webView.load(request)
        }
    }

    func handleDeepLink(url: URL) {
        let js = "window.dispatchEvent(new CustomEvent('deadlock:deeplink', { detail: { url: '\(url.absoluteString)' } }));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // Handle target="_blank" and popup windows inside WebView
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }
}
