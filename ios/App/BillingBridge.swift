//
//  BillingBridge.swift
//  DeadLock
//
//  Integration Instructions:
//  1. Ensure StoreKit framework is linked in your Xcode project.
//  2. In your WKWebView setup (e.g. ViewController.swift):
//     ```swift
//     let billingBridge = BillingBridge(webView: webView)
//     webView.configuration.userContentController.add(billingBridge, name: "DeadLockBilling")
//     ```
//  3. In Javascript, post messages to trigger actions:
//     ```javascript
//     window.webkit.messageHandlers.DeadLockBilling.postMessage({ action: 'queryProducts' });
//     window.webkit.messageHandlers.DeadLockBilling.postMessage({ action: 'purchase', sku: 'deadlock_pro_monthly' });
//     window.webkit.messageHandlers.DeadLockBilling.postMessage({ action: 'restorePurchases' });
//     window.webkit.messageHandlers.DeadLockBilling.postMessage({ action: 'getActiveSubscription' });
//     ```
//  4. Javascript should listen via global callback:
//     ```javascript
//     window.__billingCallback = function(action, payload) {
//         console.log(action, payload);
//     };
//     ```
//

import Foundation
import WebKit
import StoreKit

class BillingBridge: NSObject, WKScriptMessageHandler {
    
    weak var webView: WKWebView?
    private let creditsKey = "DeadLockConsumableCreditsBalance"
    
    init(webView: WKWebView) {
        self.webView = webView
        super.init()
    }
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "DeadLockBilling",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            return
        }
        
        if #available(iOS 15.0, *) {
            Task {
                await handleActionStoreKit2(action: action, body: body)
            }
        } else {
            // Fallback for iOS 14
            self.sendCallback(action: action, result: ["error": "In-app purchases require iOS 15 or newer."])
        }
    }
    
    @available(iOS 15.0, *)
    private func handleActionStoreKit2(action: String, body: [String: Any]) async {
        let sku = body["sku"] as? String ?? ""
        
        do {
            switch action {
            case "queryProducts":
                let productIds = [
                    "deadlock_pro_monthly",
                    "deadlock_pro_yearly",
                    "deadlock_scan_credits_50",
                    "deadlock_scan_credits_200"
                ]
                let products = try await Product.products(for: productIds)
                let productsInfo = products.map { [
                    "id": $0.id,
                    "displayName": $0.displayName,
                    "description": $0.description,
                    "price": NSDecimalNumber(decimal: $0.price).doubleValue,
                    "displayPrice": $0.displayPrice
                ] }
                self.sendCallback(action: action, result: ["products": productsInfo])
                
            case "purchase":
                guard !sku.isEmpty else {
                    self.sendCallback(action: action, result: ["error": "Missing 'sku' parameter for purchase"])
                    return
                }
                
                let products = try await Product.products(for: [sku])
                guard let product = products.first else {
                    self.sendCallback(action: action, result: ["error": "Product not found"])
                    return
                }
                
                let result = try await product.purchase()
                
                switch result {
                case .success(let verification):
                    let transaction = try checkVerified(verification)
                    await transaction.finish()
                    
                    // Handle consumable credits
                    if sku == "deadlock_scan_credits_50" {
                        addCredits(50)
                    } else if sku == "deadlock_scan_credits_200" {
                        addCredits(200)
                    }
                    
                    self.sendCallback(action: action, result: [
                        "success": true,
                        "transactionId": String(transaction.id)
                    ])
                    
                case .userCancelled:
                    self.sendCallback(action: action, result: ["success": false, "error": "User cancelled purchase"])
                case .pending:
                    self.sendCallback(action: action, result: ["success": false, "error": "Purchase is pending"])
                @unknown default:
                    self.sendCallback(action: action, result: ["success": false, "error": "Unknown purchase state"])
                }
                
            case "restorePurchases":
                try await AppStore.sync()
                self.sendCallback(action: action, result: ["success": true])
                
            case "getActiveSubscription":
                var activeSubscription: Transaction? = nil
                
                for await result in Transaction.currentEntitlements {
                    let transaction = try checkVerified(result)
                    if transaction.productType == .autoRenewable || transaction.productType == .nonRenewable {
                        activeSubscription = transaction
                        break
                    }
                }
                
                if let sub = activeSubscription {
                    self.sendCallback(action: action, result: [
                        "active": true,
                        "productId": sub.productID,
                        "transactionId": String(sub.id)
                    ])
                } else {
                    self.sendCallback(action: action, result: ["active": false])
                }
                
            default:
                self.sendCallback(action: action, result: ["error": "Unknown action '\(action)'"])
            }
        } catch {
            self.sendCallback(action: action, result: ["error": error.localizedDescription])
        }
    }
    
    @available(iOS 15.0, *)
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let safe):
            return safe
        }
    }
    
    private func sendCallback(action: String, result: [String: Any]) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: result, options: []),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return
        }
        
        DispatchQueue.main.async {
            let jsCode = "if (typeof window.__billingCallback === 'function') { window.__billingCallback('\(action)', \(jsonString)); }"
            self.webView?.evaluateJavaScript(jsCode, completionHandler: nil)
        }
    }
    
    // MARK: - Consumable Credits Management
    
    private func getCreditsBalance() -> Int {
        return UserDefaults.standard.integer(forKey: creditsKey)
    }
    
    private func addCredits(_ amount: Int) {
        let current = getCreditsBalance()
        UserDefaults.standard.set(current + amount, forKey: creditsKey)
    }
}
