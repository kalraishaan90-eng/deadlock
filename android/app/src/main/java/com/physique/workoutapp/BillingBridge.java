package com.physique.workoutapp;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class BillingBridge implements PurchasesUpdatedListener {

    private Activity activity;
    private WebView webView;
    private BillingClient billingClient;
    private SharedPreferences sharedPreferences;

    private List<ProductDetails> availableProducts = new ArrayList<>();

    public BillingBridge(Activity activity) {
        this.activity = activity;
        this.sharedPreferences = activity.getSharedPreferences("BillingPrefs", Context.MODE_PRIVATE);

        PendingPurchasesParams pendingPurchasesParams = PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .enablePrepaidPlans()
                .build();

        billingClient = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases(pendingPurchasesParams)
                .build();

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    // Connected
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Disconnected
            }
        });
    }

    public void setWebView(WebView webView) {
        this.webView = webView;
    }

    private void postResult(String action, Object data) {
        if (webView != null) {
            activity.runOnUiThread(() -> {
                String dataStr = data != null ? data.toString() : "null";
                String js = "if(window.__billingCallback) { window.__billingCallback('" + action + "', " + dataStr + "); }";
                webView.evaluateJavascript(js, null);
            });
        }
    }

    @JavascriptInterface
    public void queryProducts() {
        if (!billingClient.isReady()) {
            postResult("queryProducts", new JSONArray());
            return;
        }

        List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
        productList.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId("deadlock_pro_monthly")
                .setProductType(BillingClient.ProductType.SUBS)
                .build());
        productList.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId("deadlock_pro_yearly")
                .setProductType(BillingClient.ProductType.SUBS)
                .build());
        productList.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId("deadlock_scan_credits_50")
                .setProductType(BillingClient.ProductType.INAPP)
                .build());
        productList.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId("deadlock_scan_credits_200")
                .setProductType(BillingClient.ProductType.INAPP)
                .build());

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(productList)
                .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            JSONArray array = new JSONArray();
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && productDetailsList != null) {
                availableProducts.clear();
                availableProducts.addAll(productDetailsList);
                for (ProductDetails details : productDetailsList) {
                    try {
                        JSONObject obj = new JSONObject();
                        obj.put("id", details.getProductId());
                        obj.put("title", details.getTitle());
                        obj.put("type", details.getProductType());

                        if (details.getProductType().equals(BillingClient.ProductType.SUBS)) {
                            if (details.getSubscriptionOfferDetails() != null && !details.getSubscriptionOfferDetails().isEmpty()) {
                                obj.put("price", details.getSubscriptionOfferDetails().get(0).getPricingPhases().getPricingPhaseList().get(0).getFormattedPrice());
                            }
                        } else {
                            if (details.getOneTimePurchaseOfferDetails() != null) {
                                obj.put("price", details.getOneTimePurchaseOfferDetails().getFormattedPrice());
                            }
                        }
                        array.put(obj);
                    } catch (JSONException e) {
                        e.printStackTrace();
                    }
                }
            }
            postResult("queryProducts", array);
        });
    }

    @JavascriptInterface
    public void purchase(String sku) {
        ProductDetails selectedProduct = null;
        for (ProductDetails product : availableProducts) {
            if (product.getProductId().equals(sku)) {
                selectedProduct = product;
                break;
            }
        }

        if (selectedProduct == null) {
            JSONObject obj = new JSONObject();
            try {
                obj.put("error", "Product not found");
            } catch (JSONException e) { }
            postResult("purchaseError", obj);
            return;
        }

        List<BillingFlowParams.ProductDetailsParams> productDetailsParamsList = new ArrayList<>();

        if (selectedProduct.getProductType().equals(BillingClient.ProductType.SUBS)) {
            String offerToken = selectedProduct.getSubscriptionOfferDetails().get(0).getOfferToken();
            productDetailsParamsList.add(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(selectedProduct)
                            .setOfferToken(offerToken)
                            .build()
            );
        } else {
            productDetailsParamsList.add(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(selectedProduct)
                            .build()
            );
        }

        BillingFlowParams billingFlowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(productDetailsParamsList)
                .build();

        billingClient.launchBillingFlow(activity, billingFlowParams);
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, @Nullable List<Purchase> purchases) {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase purchase : purchases) {
                handlePurchase(purchase);
            }
        } else if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSONObject obj = new JSONObject();
            try {
                obj.put("status", "canceled");
            } catch (JSONException e) {}
            postResult("purchaseCanceled", obj);
        } else {
            JSONObject obj = new JSONObject();
            try {
                obj.put("error", billingResult.getDebugMessage());
            } catch (JSONException e) {}
            postResult("purchaseError", obj);
        }
    }

    private void handlePurchase(Purchase purchase) {
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
            boolean isConsumable = false;
            for (String product : purchase.getProducts()) {
                if (product.equals("deadlock_scan_credits_50") || product.equals("deadlock_scan_credits_200")) {
                    isConsumable = true;
                    if (product.equals("deadlock_scan_credits_50")) {
                        addCredits(50);
                    } else if (product.equals("deadlock_scan_credits_200")) {
                        addCredits(200);
                    }
                }
            }

            if (isConsumable) {
                ConsumeParams consumeParams =
                        ConsumeParams.newBuilder()
                                .setPurchaseToken(purchase.getPurchaseToken())
                                .build();
                billingClient.consumeAsync(consumeParams, (billingResult, outToken) -> {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        try {
                            JSONObject obj = new JSONObject();
                            obj.put("status", "success");
                            obj.put("products", new JSONArray(purchase.getProducts()));
                            postResult("purchaseSuccess", obj);
                        } catch (JSONException e) {}
                    }
                });
            } else {
                if (!purchase.isAcknowledged()) {
                    AcknowledgePurchaseParams acknowledgePurchaseParams =
                            AcknowledgePurchaseParams.newBuilder()
                                    .setPurchaseToken(purchase.getPurchaseToken())
                                    .build();
                    billingClient.acknowledgePurchase(acknowledgePurchaseParams, billingResult -> {
                        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                            try {
                                JSONObject obj = new JSONObject();
                                obj.put("status", "success");
                                obj.put("products", new JSONArray(purchase.getProducts()));
                                postResult("purchaseSuccess", obj);
                            } catch (JSONException e) {}
                        }
                    });
                } else {
                    try {
                        JSONObject obj = new JSONObject();
                        obj.put("status", "success");
                        obj.put("products", new JSONArray(purchase.getProducts()));
                        postResult("purchaseSuccess", obj);
                    } catch (JSONException e) {}
                }
            }
        }
    }

    private void addCredits(int amount) {
        int current = sharedPreferences.getInt("credits", 0);
        sharedPreferences.edit().putInt("credits", current + amount).apply();
    }

    @JavascriptInterface
    public void restorePurchases() {
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build(),
                (billingResult, purchases) -> {
                    JSONArray array = new JSONArray();
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        for (Purchase purchase : purchases) {
                            for(String p: purchase.getProducts()) {
                                array.put(p);
                            }
                            if (!purchase.isAcknowledged()) {
                                AcknowledgePurchaseParams acknowledgePurchaseParams =
                                        AcknowledgePurchaseParams.newBuilder()
                                                .setPurchaseToken(purchase.getPurchaseToken())
                                                .build();
                                billingClient.acknowledgePurchase(acknowledgePurchaseParams, res -> {});
                            }
                        }
                    }
                    postResult("restorePurchases", array);
                }
        );
    }

    @JavascriptInterface
    public void getActiveSubscription() {
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build(),
                (billingResult, purchases) -> {
                    try {
                        JSONObject obj = new JSONObject();
                        obj.put("active", false);
                        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
                            for (Purchase purchase : purchases) {
                                if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                                    obj.put("active", true);
                                    obj.put("productId", purchase.getProducts().get(0));
                                    break; // Found an active sub
                                }
                            }
                        }
                        postResult("activeSubscription", obj);
                    } catch (JSONException e) {
                        e.printStackTrace();
                    }
                }
        );
    }
}
