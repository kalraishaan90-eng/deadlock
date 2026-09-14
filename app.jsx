// Dead Lock — Elite Workout & Nutrition Engine
// Comprehensive client-side React single-file application

const { useState, useEffect, useRef, useMemo } = React;

// ==========================================
// 1. STORAGE KEYS & DATA SCHEMA
// ==========================================
const APP_VERSION = '1.0.0';
const APP_BUILD = '1';

const STORAGE_KEYS_GLOBAL = {
  AUTH_USER: 'deadlock_auth_user',
  AUTH_GUEST: 'deadlock_auth_guest'
};

function getStorageKeys(uid) {
  const ns = uid || 'guest';
  return {
    PROFILE: `deadlock_${ns}_profile`,
    EQUIPMENT: `deadlock_${ns}_equipment`,
    WORKOUT_LOG: `deadlock_${ns}_workout_log`,
    FOOD_LOG: `deadlock_${ns}_food_log`,
    WEIGHT_LOG: `deadlock_${ns}_weight_log`,
    API_KEY: `deadlock_${ns}_api_key`,
    HAS_ONBOARDED: `deadlock_${ns}_has_onboarded`,
    IS_PRO: `deadlock_${ns}_is_pro`,
    PRO_EXPIRY: `deadlock_${ns}_pro_expiry`,
    SCAN_CREDITS: `deadlock_${ns}_scan_credits`,
    CAMERA_USAGE: `deadlock_${ns}_camera_usage`,
    AI_SCAN_USAGE: `deadlock_${ns}_ai_scan_usage`,
    DIET_PREFERENCES: `deadlock_${ns}_diet_preferences`,
    DIET_PLAN: `deadlock_${ns}_diet_plan`
  };
}

function migrateLegacyStorage(uid) {
  try {
    const oldKeys = {
      PROFILE: 'deadlock_profile',
      EQUIPMENT: 'deadlock_equipment',
      WORKOUT_LOG: 'deadlock_workout_log',
      FOOD_LOG: 'deadlock_food_log',
      WEIGHT_LOG: 'deadlock_weight_log',
      API_KEY: 'deadlock_api_key',
      HAS_ONBOARDED: 'deadlock_has_onboarded'
    };
    const newKeys = getStorageKeys(uid);
    Object.keys(oldKeys).forEach((k) => {
      const oldVal = localStorage.getItem(oldKeys[k]);
      if (oldVal !== null && localStorage.getItem(newKeys[k]) === null) {
        localStorage.setItem(newKeys[k], oldVal);
        localStorage.removeItem(oldKeys[k]);
      }
    });
  } catch (e) {}
}

function clearUserStorage(uid) {
  try {
    const keys = getStorageKeys(uid);
    Object.values(keys).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(STORAGE_KEYS_GLOBAL.AUTH_USER);
    localStorage.removeItem(STORAGE_KEYS_GLOBAL.AUTH_GUEST);
  } catch (e) {}
}

// ==========================================
// CROSS-PLATFORM GOOGLE OAUTH & FIREBASE AUTH
// Handles iOS, Android, and Web flows
// ==========================================
function getRuntimePlatform() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isAndroid = /Android/.test(navigator.userAgent);
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return 'web';
}

// Firebase configuration derived directly from google-services.json
const GOOGLE_SERVICES_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAVIoo3XSAsxZAjrWzERWU-UZqPSE4iQR0',
  authDomain: 'workkoutapp.firebaseapp.com',
  projectId: 'workkoutapp',
  storageBucket: 'workkoutapp.firebasestorage.app',
  messagingSenderId: '646212023629',
  appId: '1:646212023629:android:c692059775553749c27304'
};

function getFirebaseAuthInstance() {
  if (typeof firebase === 'undefined') {
    return null;
  }
  if (!firebase.apps || !firebase.apps.length) {
    const isIOS = getRuntimePlatform() === 'ios';
    const cfg = window.PHYSIQUE_CONFIG || {};
    const firebaseConfig = isIOS 
      ? (cfg.FIREBASE_CONFIG_IOS || cfg.FIREBASE_CONFIG || GOOGLE_SERVICES_FIREBASE_CONFIG) 
      : (cfg.FIREBASE_CONFIG || cfg.FIREBASE_CONFIG_ANDROID || GOOGLE_SERVICES_FIREBASE_CONFIG);
    if (firebaseConfig) {
      try {
        firebase.initializeApp(firebaseConfig);
      } catch (err) {
        
      }
    }
  }
  if (firebase.auth) {
    const auth = firebase.auth();
    window.firebaseAuth = auth;
    return auth;
  }
  return null;
}

// Verify token with backend server
async function verifyServerToken(idToken, platform) {
  try {
    const res = await fetch('/api/auth/google/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, platform })
    });
    if (res.ok) {
      const data = await res.json();
      
      return data;
    } else {
      const err = await res.json().catch(() => ({}));
      
      return { valid: false, error: err.error };
    }
  } catch (netErr) {
    
    return { valid: true, offline: true };
  }
}

async function signInWithGoogleCrossPlatform() {
  let auth = getFirebaseAuthInstance();
  if (!auth && typeof window.initFirebase === 'function') {
    auth = window.initFirebase();
  }
  if (!auth) {
    throw new Error('Firebase Authentication SDK is not loaded.');
  }

  const platform = getRuntimePlatform();
  const provider = new firebase.auth.GoogleAuthProvider();
  
  // Configure Google OAuth parameters
  const customParams = { prompt: 'select_account' };
  
  // For iOS clients, specify the iOS Client ID if needed
  if (platform === 'ios' && window.PHYSIQUE_CONFIG?.GOOGLE_OAUTH?.IOS?.clientId) {
    customParams.client_id = window.PHYSIQUE_CONFIG.GOOGLE_OAUTH.IOS.clientId;
  }
  provider.setCustomParameters(customParams);

  // In iOS Safari / standalone PWA / WKWebView, popups are frequently blocked or disabled
  const isStandalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  let credentialUser = null;
  let idToken = null;

  try {
    // Attempt popup flow first
    const result = await auth.signInWithPopup(provider);
    credentialUser = result.user;
    idToken = await credentialUser.getIdToken();
  } catch (popupErr) {
    
    
    // If popup was blocked or user is on iOS / standalone PWA, fall back to redirect flow
    if (
      popupErr.code === 'auth/popup-blocked' ||
      popupErr.code === 'auth/popup-closed-by-user' ||
      popupErr.code === 'auth/cancelled-popup-request' ||
      platform === 'ios' ||
      isStandalone
    ) {
      
      await auth.signInWithRedirect(provider);
      return { pendingRedirect: true };
    }
    throw popupErr;
  }

  if (idToken) {
    await verifyServerToken(idToken, platform);
  }

  return {
    user: {
      uid: credentialUser.uid,
      displayName: credentialUser.displayName || 'Dead Lock Athlete',
      email: credentialUser.email || '',
      photoURL: credentialUser.photoURL || '',
      platform: platform,
      lastLogin: Date.now()
    }
  };
}

async function handleCheckRedirect() {
  const auth = getFirebaseAuthInstance();
  if (!auth) return null;
  try {
    const result = await auth.getRedirectResult();
    if (result && result.user) {
      const platform = getRuntimePlatform();
      const idToken = await result.user.getIdToken();
      await verifyServerToken(idToken, platform);
      return {
        uid: result.user.uid,
        displayName: result.user.displayName || 'Dead Lock Athlete',
        email: result.user.email || '',
        photoURL: result.user.photoURL || '',
        platform: platform,
        lastLogin: Date.now()
      };
    }
  } catch (err) {
    
  }
  return null;
}

async function signOutFirebase() {
  const auth = getFirebaseAuthInstance();
  if (auth) {
    try {
      await auth.signOut();
    } catch (e) {
      
    }
  }
  localStorage.removeItem(STORAGE_KEYS_GLOBAL.AUTH_USER);
  localStorage.removeItem(STORAGE_KEYS_GLOBAL.AUTH_GUEST);
}

const DEFAULT_EQUIPMENT_OPTIONS = [
  'EZ / curl bar',
  'Barbell',
  'Weight plates',
  'Adjustable dumbbells',
  'Fixed dumbbells',
  'Bench',
  'Pull-up bar',
  'Resistance bands',
  'No bench (floor only)',
  'Bodyweight only'
];

// ==========================================
// 2. INDEXEDDB FOR FOOD PHOTOS
// ==========================================
const DB_NAME = 'deadlock_photos_db';
const DB_VERSION = 1;
const PHOTO_STORE = 'photos';

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePhotoToDb(id, base64) {
  try {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE);
      store.put({ id, data: base64, timestamp: Date.now() });
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    
    return null;
  }
}

async function getPhotoFromDb(id) {
  try {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, 'readonly');
      const store = tx.objectStore(PHOTO_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    
    return null;
  }
}

async function clearAllPhotosFromDb() {
  try {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return null;
  }
}

// ==========================================
// 2.5 BILLING & ENTITLEMENT ENGINE
// Platform billing abstraction + free-tier metering
// ==========================================

const FREE_TIER_LIMITS = {
  CAMERA_SETS_PER_WEEK: 3,
  AI_SCANS_PER_DAY: 3
};

// Platform billing bridge abstraction
const BillingService = {
  _platform: (() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    return isIOS ? 'ios' : isAndroid ? 'android' : 'web';
  })(),

  isAvailable() {
    if (this._platform === 'android') return typeof window.DeadLockBilling !== 'undefined';
    if (this._platform === 'ios') return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.DeadLockBilling);
    return false;
  },

  _pendingCallbacks: {},

  _postToNative(action, data) {
    return new Promise((resolve, reject) => {
      const callbackId = 'billing_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      this._pendingCallbacks[callbackId] = { resolve, reject };
      const payload = { action, callbackId, ...data };

      try {
        if (this._platform === 'android' && window.DeadLockBilling) {
          window.DeadLockBilling[action](JSON.stringify(payload));
        } else if (this._platform === 'ios' && window.webkit?.messageHandlers?.DeadLockBilling) {
          window.webkit.messageHandlers.DeadLockBilling.postMessage(payload);
        } else {
          reject(new Error('Billing not available on this platform'));
        }
      } catch (e) {
        delete this._pendingCallbacks[callbackId];
        reject(e);
      }

      // Timeout after 30s
      setTimeout(() => {
        if (this._pendingCallbacks[callbackId]) {
          delete this._pendingCallbacks[callbackId];
          reject(new Error('Billing request timed out'));
        }
      }, 30000);
    });
  },

  async queryProducts() {
    if (!this.isAvailable()) return [];
    try {
      const result = await this._postToNative('queryProducts', {});
      return Array.isArray(result) ? result : [];
    } catch (e) {
      return [];
    }
  },

  async purchase(sku) {
    if (!this.isAvailable()) return { status: 'unavailable' };
    try {
      return await this._postToNative('purchase', { sku });
    } catch (e) {
      return { status: 'failed', error: e.message };
    }
  },

  async restorePurchases() {
    if (!this.isAvailable()) return { restored: false };
    try {
      return await this._postToNative('restorePurchases', {});
    } catch (e) {
      return { restored: false, error: e.message };
    }
  },

  async checkActiveSubscription() {
    if (!this.isAvailable()) return { active: false };
    try {
      return await this._postToNative('getActiveSubscription', {});
    } catch (e) {
      return { active: false };
    }
  }
};

// Global callback handler for native billing bridge responses
window.__billingCallback = function(callbackId, status, data) {
  const cb = BillingService._pendingCallbacks[callbackId];
  if (cb) {
    delete BillingService._pendingCallbacks[callbackId];
    if (status === 'success') {
      try { cb.resolve(typeof data === 'string' ? JSON.parse(data) : data); } catch (e) { cb.resolve(data); }
    } else {
      cb.reject(new Error(typeof data === 'string' ? data : 'Billing error'));
    }
  }
};

// Entitlement verification — checks platform billing on launch
async function verifyProEntitlement(userKeys) {
  // 1. Check native billing bridge
  if (BillingService.isAvailable()) {
    try {
      const sub = await BillingService.checkActiveSubscription();
      const isPro = sub && sub.active === true;
      localStorage.setItem(userKeys.IS_PRO, isPro ? 'true' : 'false');
      if (sub.expiresAt) {
        localStorage.setItem(userKeys.PRO_EXPIRY, sub.expiresAt);
      }
      return { isPro, expiresAt: sub.expiresAt || null };
    } catch (e) {
      // Fallback to cached value
    }
  }
  // 2. Fallback to cached local value
  const cached = localStorage.getItem(userKeys.IS_PRO) === 'true';
  const expiry = localStorage.getItem(userKeys.PRO_EXPIRY);
  if (cached && expiry) {
    const expiresAt = new Date(expiry);
    if (expiresAt > new Date()) {
      return { isPro: true, expiresAt: expiry };
    }
    // Expired — clear cache
    localStorage.setItem(userKeys.IS_PRO, 'false');
    localStorage.removeItem(userKeys.PRO_EXPIRY);
  }
  return { isPro: cached && !expiry, expiresAt: expiry || null };
}

// Camera tracking usage — rolling 7-day window
function canUseCameraTracking(userKeys, isPro) {
  if (isPro) return { allowed: true, used: 0, limit: Infinity };
  try {
    const raw = localStorage.getItem(userKeys.CAMERA_USAGE);
    const usage = raw ? JSON.parse(raw) : [];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentUsage = usage.filter(ts => ts > sevenDaysAgo);
    const used = recentUsage.length;
    return {
      allowed: used < FREE_TIER_LIMITS.CAMERA_SETS_PER_WEEK,
      used,
      limit: FREE_TIER_LIMITS.CAMERA_SETS_PER_WEEK,
      remaining: Math.max(0, FREE_TIER_LIMITS.CAMERA_SETS_PER_WEEK - used)
    };
  } catch (e) {
    return { allowed: true, used: 0, limit: FREE_TIER_LIMITS.CAMERA_SETS_PER_WEEK };
  }
}

function recordCameraUsage(userKeys) {
  try {
    const raw = localStorage.getItem(userKeys.CAMERA_USAGE);
    const usage = raw ? JSON.parse(raw) : [];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const cleaned = usage.filter(ts => ts > sevenDaysAgo);
    cleaned.push(Date.now());
    localStorage.setItem(userKeys.CAMERA_USAGE, JSON.stringify(cleaned));
  } catch (e) {}
}

// AI scan usage — calendar day limit
function canUseAiScan(userKeys, isPro) {
  if (isPro) return { allowed: true, used: 0, limit: Infinity };
  try {
    const raw = localStorage.getItem(userKeys.AI_SCAN_USAGE);
    const usage = raw ? JSON.parse(raw) : { date: '', count: 0 };
    const today = new Date().toISOString().slice(0, 10);
    if (usage.date !== today) {
      return { allowed: true, used: 0, limit: FREE_TIER_LIMITS.AI_SCANS_PER_DAY, remaining: FREE_TIER_LIMITS.AI_SCANS_PER_DAY };
    }
    const used = usage.count || 0;
    return {
      allowed: used < FREE_TIER_LIMITS.AI_SCANS_PER_DAY,
      used,
      limit: FREE_TIER_LIMITS.AI_SCANS_PER_DAY,
      remaining: Math.max(0, FREE_TIER_LIMITS.AI_SCANS_PER_DAY - used)
    };
  } catch (e) {
    return { allowed: true, used: 0, limit: FREE_TIER_LIMITS.AI_SCANS_PER_DAY };
  }
}

function recordAiScanUsage(userKeys) {
  try {
    const raw = localStorage.getItem(userKeys.AI_SCAN_USAGE);
    const usage = raw ? JSON.parse(raw) : { date: '', count: 0 };
    const today = new Date().toISOString().slice(0, 10);
    if (usage.date !== today) {
      localStorage.setItem(userKeys.AI_SCAN_USAGE, JSON.stringify({ date: today, count: 1 }));
    } else {
      localStorage.setItem(userKeys.AI_SCAN_USAGE, JSON.stringify({ date: today, count: (usage.count || 0) + 1 }));
    }
  } catch (e) {}
}

// Scan credit management (consumable packs)
function getScanCredits(userKeys) {
  try {
    return parseInt(localStorage.getItem(userKeys.SCAN_CREDITS) || '0', 10);
  } catch (e) {
    return 0;
  }
}

function addScanCredits(userKeys, amount) {
  try {
    const current = getScanCredits(userKeys);
    localStorage.setItem(userKeys.SCAN_CREDITS, String(current + amount));
    return current + amount;
  } catch (e) {
    return 0;
  }
}

function useScanCredit(userKeys) {
  const current = getScanCredits(userKeys);
  if (current > 0) {
    localStorage.setItem(userKeys.SCAN_CREDITS, String(current - 1));
    return { used: true, remaining: current - 1 };
  }
  return { used: false, remaining: 0 };
}

// ==========================================
// 3. MACRO CALCULATION ENGINE (Mifflin-St Jeor)
// ==========================================
function calculateMacros(profile) {
  if (!profile || !profile.age || !profile.heightCm || !profile.weightKg) {
    return { bmr: 0, tdee: 0, targetCalories: 0, protein: 0, fat: 0, carbs: 0 };
  }
  const age = Number(profile.age) || 25;
  const heightCm = Number(profile.heightCm) || 175;
  const weightKg = Number(profile.weightKg) || 75;
  const sex = profile.sex || 'male';
  const goal = profile.goal || 'cut';
  const activityLevel = profile.activityLevel || 'moderate';
  
  // Mifflin-St Jeor Formula
  const baseBmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmr = sex === 'male' ? baseBmr + 5 : baseBmr - 161;

  // Activity Multipliers
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very_active: 1.725
  };
  const multiplier = multipliers[activityLevel] || 1.375;
  const tdee = Math.round(bmr * multiplier);

  // Goal adjustment: cut = -500, bulk = +300, recomp/maintain = TDEE
  let targetCalories = tdee;
  if (goal === 'cut') {
    targetCalories = tdee - 500;
  } else if (goal === 'bulk') {
    targetCalories = tdee + 300;
  }
  targetCalories = Math.max(1200, Math.round(targetCalories));

  // Protein target: 2.2 g/kg (cut), 1.8 g/kg (bulk), 2.0 g/kg (recomp/maintain)
  let proteinMultiplier = 2.0;
  if (goal === 'cut') proteinMultiplier = 2.2;
  else if (goal === 'bulk') proteinMultiplier = 1.8;
  const protein = Math.round(weightKg * proteinMultiplier);

  // Fat target: 25% of adjusted calories / 9
  const fat = Math.round((targetCalories * 0.25) / 9);

  // Carb target: remaining calories / 4
  const remainingCals = targetCalories - (protein * 4) - (fat * 9);
  const carbs = Math.max(0, Math.round(remainingCals / 4));

  return { bmr: Math.round(bmr), tdee, targetCalories, protein, fat, carbs };
}

// Macro Engine initialized

// ==========================================
// 3.5 INSTANT NUTRITION KNOWLEDGE BASE & PARSER
// Offline-first calculation for immediate macro feedback
// ==========================================
const NUTRITION_DATABASE = [
  // ===== BREADS & GRAINS =====
  { keys: ['white bread', 'slice of bread', 'bread slice', 'bread', 'toast', 'breads'], name: 'White Bread', unit: 'slice (30g)', cal: 75, p: 2.5, c: 14.0, f: 1.0, category: 'grain', dietType: 'veg' },
  { keys: ['brown bread', 'whole wheat bread', 'multigrain bread'], name: 'Whole Wheat Bread', unit: 'slice (32g)', cal: 72, p: 3.2, c: 13.0, f: 1.1, category: 'grain', dietType: 'veg' },
  { keys: ['roti', 'chapati', 'phulka', 'rotis', 'chapatis'], name: 'Roti / Chapati', unit: 'piece (40g)', cal: 105, p: 3.2, c: 20.0, f: 1.2, category: 'grain', dietType: 'veg' },
  { keys: ['paratha', 'parathas', 'aloo paratha'], name: 'Paratha', unit: 'piece (65g)', cal: 240, p: 4.5, c: 31.0, f: 11.0, category: 'grain', dietType: 'veg' },
  { keys: ['naan', 'butter naan', 'garlic naan'], name: 'Naan', unit: 'piece (90g)', cal: 260, p: 7.5, c: 45.0, f: 5.5, category: 'grain', dietType: 'veg' },
  { keys: ['rice', 'white rice', 'cooked rice', 'steamed rice', 'chawal'], name: 'White Rice (cooked)', unit: '1 bowl (150g)', cal: 195, p: 4.1, c: 42.0, f: 0.4, category: 'grain', dietType: 'veg' },
  { keys: ['brown rice'], name: 'Brown Rice (cooked)', unit: '1 bowl (150g)', cal: 170, p: 4.0, c: 35.0, f: 1.5, category: 'grain', dietType: 'veg' },
  { keys: ['pasta', 'cooked pasta', 'spaghetti', 'macaroni', 'penne'], name: 'Pasta (cooked)', unit: '1 cup (140g)', cal: 185, p: 7.0, c: 38.0, f: 1.1, category: 'grain', dietType: 'veg' },
  { keys: ['oats', 'oatmeal', 'rolled oats'], name: 'Oats / Oatmeal', unit: 'serving (40g dry)', cal: 152, p: 5.3, c: 27.0, f: 2.8, category: 'grain', dietType: 'veg' },
  { keys: ['quinoa'], name: 'Quinoa (cooked)', unit: '1 cup (185g)', cal: 222, p: 8.1, c: 39.0, f: 3.6, category: 'grain', dietType: 'veg' },
  { keys: ['ragi roti', 'ragi chapati', 'nachni roti'], name: 'Ragi Roti', unit: 'piece (45g)', cal: 110, p: 3.5, c: 22.0, f: 1.0, category: 'grain', dietType: 'veg' },
  { keys: ['bajra roti', 'bajra chapati', 'pearl millet roti'], name: 'Bajra Roti', unit: 'piece (45g)', cal: 115, p: 3.0, c: 23.0, f: 1.2, category: 'grain', dietType: 'veg' },
  { keys: ['jowar roti', 'jowar chapati', 'sorghum roti'], name: 'Jowar Roti', unit: 'piece (45g)', cal: 108, p: 3.2, c: 22.5, f: 0.8, category: 'grain', dietType: 'veg' },
  { keys: ['makki roti', 'makki ki roti', 'corn roti'], name: 'Makki Roti', unit: 'piece (55g)', cal: 130, p: 2.8, c: 28.0, f: 1.5, category: 'grain', dietType: 'veg' },
  { keys: ['couscous'], name: 'Couscous (cooked)', unit: '1 cup (160g)', cal: 176, p: 6.0, c: 36.0, f: 0.3, category: 'grain', dietType: 'veg' },
  { keys: ['bulgur', 'bulgur wheat', 'dalia'], name: 'Bulgur Wheat (cooked)', unit: '1 cup (182g)', cal: 151, p: 5.6, c: 34.0, f: 0.4, category: 'grain', dietType: 'veg' },
  { keys: ['whole wheat wrap', 'tortilla', 'wrap'], name: 'Whole Wheat Wrap', unit: '1 wrap (64g)', cal: 170, p: 5.5, c: 28.0, f: 4.5, category: 'grain', dietType: 'veg' },
  { keys: ['bagel'], name: 'Plain Bagel', unit: '1 bagel (95g)', cal: 270, p: 10.0, c: 52.0, f: 1.5, category: 'grain', dietType: 'veg' },
  { keys: ['english muffin'], name: 'English Muffin', unit: '1 muffin (57g)', cal: 132, p: 4.5, c: 26.0, f: 1.0, category: 'grain', dietType: 'veg' },

  // ===== SOUTH INDIAN BREAKFASTS =====
  { keys: ['idli', 'idlis'], name: 'Idli', unit: '2 pieces (80g)', cal: 120, p: 3.5, c: 24.0, f: 0.5, category: 'grain', dietType: 'veg' },
  { keys: ['dosa', 'masala dosa', 'plain dosa'], name: 'Dosa (plain)', unit: '1 piece (60g)', cal: 130, p: 3.0, c: 22.0, f: 3.5, category: 'grain', dietType: 'veg' },
  { keys: ['upma', 'rava upma', 'semolina upma'], name: 'Upma', unit: '1 bowl (200g)', cal: 210, p: 5.0, c: 32.0, f: 7.0, category: 'grain', dietType: 'veg' },
  { keys: ['poha', 'flattened rice', 'chivda poha'], name: 'Poha', unit: '1 bowl (200g)', cal: 245, p: 4.5, c: 42.0, f: 6.5, category: 'grain', dietType: 'veg' },
  { keys: ['uttapam', 'uttappam'], name: 'Uttapam', unit: '1 piece (120g)', cal: 185, p: 5.0, c: 30.0, f: 5.0, category: 'grain', dietType: 'veg' },
  { keys: ['dhokla'], name: 'Dhokla', unit: '3 pieces (100g)', cal: 160, p: 7.0, c: 25.0, f: 3.0, category: 'grain', dietType: 'veg' },
  { keys: ['sabudana khichdi', 'sabudana'], name: 'Sabudana Khichdi', unit: '1 bowl (200g)', cal: 280, p: 4.0, c: 48.0, f: 8.0, category: 'grain', dietType: 'veg' },
  { keys: ['besan chilla', 'besan cheela', 'chickpea pancake'], name: 'Besan Chilla', unit: '1 piece (80g)', cal: 145, p: 7.0, c: 15.0, f: 6.5, category: 'grain', dietType: 'veg' },
  { keys: ['moong dal chilla', 'moong cheela'], name: 'Moong Dal Chilla', unit: '1 piece (80g)', cal: 120, p: 8.0, c: 14.0, f: 3.5, category: 'legume', dietType: 'veg' },
  { keys: ['granola', 'granola cereal'], name: 'Granola', unit: '0.5 cup (60g)', cal: 270, p: 6.0, c: 40.0, f: 10.0, category: 'grain', dietType: 'veg' },
  { keys: ['muesli'], name: 'Muesli', unit: '0.5 cup (55g)', cal: 190, p: 5.0, c: 36.0, f: 3.5, category: 'grain', dietType: 'veg' },
  { keys: ['overnight oats'], name: 'Overnight Oats', unit: '1 jar (250g)', cal: 310, p: 12.0, c: 45.0, f: 9.0, category: 'grain', dietType: 'veg' },
  { keys: ['protein pancakes', 'protein pancake'], name: 'Protein Pancakes', unit: '2 pancakes (120g)', cal: 220, p: 20.0, c: 22.0, f: 5.0, category: 'grain', dietType: 'egg' },

  // ===== PROTEINS & MEATS =====
  { keys: ['chicken breast', 'grilled chicken breast', 'boiled chicken breast'], name: 'Chicken Breast (skinless)', unit: '100g cooked', cal: 165, p: 31.0, c: 0, f: 3.6, perGram: 100, category: 'protein', dietType: 'nonveg' },
  { keys: ['chicken', 'chicken curry', 'cooked chicken'], name: 'Chicken', unit: '100g cooked', cal: 215, p: 24.0, c: 1.0, f: 12.0, perGram: 100, category: 'protein', dietType: 'nonveg' },
  { keys: ['chicken tikka', 'tikka chicken'], name: 'Chicken Tikka', unit: '100g', cal: 175, p: 28.0, c: 3.0, f: 6.0, perGram: 100, category: 'protein', dietType: 'nonveg' },
  { keys: ['tandoori chicken'], name: 'Tandoori Chicken', unit: '1 leg piece (120g)', cal: 220, p: 30.0, c: 2.0, f: 10.0, category: 'protein', dietType: 'nonveg' },
  { keys: ['butter chicken'], name: 'Butter Chicken', unit: '1 serving (200g)', cal: 380, p: 26.0, c: 12.0, f: 26.0, category: 'protein', dietType: 'nonveg' },
  { keys: ['chicken biryani'], name: 'Chicken Biryani', unit: '1 plate (300g)', cal: 490, p: 22.0, c: 62.0, f: 16.0, category: 'grain', dietType: 'nonveg' },
  { keys: ['egg white', 'boiled egg white', 'egg whites'], name: 'Egg White', unit: '1 large (33g)', cal: 17, p: 3.6, c: 0.2, f: 0.1, category: 'protein', dietType: 'egg' },
  { keys: ['egg', 'boiled egg', 'large egg', 'whole egg', 'eggs'], name: 'Whole Egg', unit: '1 large (50g)', cal: 72, p: 6.3, c: 0.4, f: 4.8, category: 'protein', dietType: 'egg' },
  { keys: ['omelet', 'omelette', 'scrambled eggs', 'scrambled egg'], name: 'Omelet (2 eggs)', unit: '2 eggs (100g)', cal: 180, p: 13.0, c: 1.2, f: 14.0, category: 'protein', dietType: 'egg' },
  { keys: ['egg bhurji', 'anda bhurji'], name: 'Egg Bhurji', unit: '2 eggs (120g)', cal: 200, p: 13.0, c: 3.0, f: 15.0, category: 'protein', dietType: 'egg' },
  { keys: ['egg curry', 'anda curry'], name: 'Egg Curry', unit: '2 eggs with gravy (200g)', cal: 260, p: 14.0, c: 8.0, f: 18.0, category: 'protein', dietType: 'egg' },
  { keys: ['salmon', 'grilled salmon'], name: 'Salmon', unit: '100g cooked', cal: 208, p: 20.4, c: 0, f: 13.4, perGram: 100, category: 'protein', dietType: 'nonveg' },
  { keys: ['tuna', 'canned tuna'], name: 'Tuna (canned in water)', unit: '1 can (120g drained)', cal: 130, p: 29.0, c: 0, f: 1.0, category: 'protein', dietType: 'nonveg' },
  { keys: ['beef', 'ground beef', 'steak', 'lean beef'], name: 'Lean Beef', unit: '100g cooked', cal: 215, p: 26.0, c: 0, f: 11.5, perGram: 100, category: 'protein', dietType: 'nonveg' },
  { keys: ['fish curry', 'machli curry', 'fish masala'], name: 'Fish Curry', unit: '1 serving (200g)', cal: 260, p: 22.0, c: 8.0, f: 15.0, category: 'protein', dietType: 'nonveg' },
  { keys: ['fish fry', 'fried fish', 'tawa fish'], name: 'Fish Fry (pan-fried)', unit: '1 piece (100g)', cal: 195, p: 20.0, c: 5.0, f: 10.0, perGram: 100, category: 'protein', dietType: 'nonveg' },
  { keys: ['prawn curry', 'shrimp curry', 'jhinga curry'], name: 'Prawn Curry', unit: '1 serving (200g)', cal: 220, p: 22.0, c: 6.0, f: 12.0, category: 'protein', dietType: 'nonveg' },
  { keys: ['mutton curry', 'goat curry', 'lamb curry'], name: 'Mutton Curry', unit: '1 serving (200g)', cal: 380, p: 28.0, c: 6.0, f: 28.0, category: 'protein', dietType: 'nonveg' },
  { keys: ['keema', 'mutton keema', 'chicken keema'], name: 'Keema', unit: '1 bowl (150g)', cal: 290, p: 22.0, c: 4.0, f: 20.0, category: 'protein', dietType: 'nonveg' },
  { keys: ['turkey breast', 'turkey'], name: 'Turkey Breast', unit: '100g cooked', cal: 135, p: 30.0, c: 0, f: 1.0, perGram: 100, category: 'protein', dietType: 'nonveg' },
  { keys: ['ground turkey'], name: 'Ground Turkey (lean)', unit: '100g cooked', cal: 170, p: 27.0, c: 0, f: 6.5, perGram: 100, category: 'protein', dietType: 'nonveg' },
  { keys: ['lean pork', 'pork tenderloin', 'pork'], name: 'Lean Pork', unit: '100g cooked', cal: 185, p: 26.0, c: 0, f: 8.5, perGram: 100, category: 'protein', dietType: 'nonveg' },
  { keys: ['whey protein', 'whey', 'protein powder', 'protein shake', 'protein scoop'], name: 'Whey Protein', unit: '1 scoop (30g)', cal: 120, p: 24.0, c: 3.0, f: 1.5, category: 'protein', dietType: 'veg' },
  { keys: ['protein bar', 'energy bar'], name: 'Protein Bar', unit: '1 bar (60g)', cal: 210, p: 20.0, c: 22.0, f: 7.0, category: 'protein', dietType: 'veg' },

  // ===== DAIRY & PLANT PROTEINS =====
  { keys: ['paneer', 'cottage cheese'], name: 'Paneer', unit: '100g', cal: 265, p: 18.0, c: 4.0, f: 20.0, perGram: 100, category: 'protein', dietType: 'veg' },
  { keys: ['paneer tikka', 'grilled paneer'], name: 'Paneer Tikka', unit: '100g', cal: 230, p: 18.0, c: 5.0, f: 16.0, perGram: 100, category: 'protein', dietType: 'veg' },
  { keys: ['palak paneer', 'spinach paneer'], name: 'Palak Paneer', unit: '1 serving (200g)', cal: 330, p: 16.0, c: 10.0, f: 25.0, category: 'protein', dietType: 'veg' },
  { keys: ['tofu', 'firm tofu'], name: 'Tofu', unit: '100g', cal: 83, p: 8.8, c: 1.9, f: 4.8, perGram: 100, category: 'protein', dietType: 'vegan' },
  { keys: ['tempeh'], name: 'Tempeh', unit: '100g', cal: 192, p: 20.0, c: 7.5, f: 11.0, perGram: 100, category: 'protein', dietType: 'vegan' },
  { keys: ['seitan', 'wheat gluten'], name: 'Seitan', unit: '100g', cal: 150, p: 25.0, c: 6.0, f: 2.0, perGram: 100, category: 'protein', dietType: 'vegan' },
  { keys: ['milk', 'whole milk', 'full cream milk', 'cow milk'], name: 'Whole Milk', unit: '1 cup (240ml)', cal: 150, p: 8.0, c: 12.0, f: 8.0, category: 'dairy', dietType: 'veg' },
  { keys: ['skim milk', 'low fat milk', 'skimmed milk'], name: 'Low-Fat Milk', unit: '1 cup (240ml)', cal: 90, p: 8.5, c: 12.5, f: 0.2, category: 'dairy', dietType: 'veg' },
  { keys: ['curd', 'yogurt', 'dahi'], name: 'Curd / Yogurt', unit: '1 bowl (150g)', cal: 92, p: 5.3, c: 7.0, f: 5.0, category: 'dairy', dietType: 'veg' },
  { keys: ['greek yogurt', 'plain greek yogurt'], name: 'Greek Yogurt (non-fat)', unit: '1 cup (150g)', cal: 90, p: 15.0, c: 5.0, f: 0.5, category: 'dairy', dietType: 'veg' },
  { keys: ['buttermilk', 'chaas', 'mattha'], name: 'Buttermilk / Chaas', unit: '1 glass (200ml)', cal: 40, p: 2.5, c: 5.0, f: 1.0, category: 'dairy', dietType: 'veg' },
  { keys: ['lassi', 'sweet lassi', 'mango lassi'], name: 'Lassi', unit: '1 glass (250ml)', cal: 180, p: 6.0, c: 28.0, f: 5.0, category: 'dairy', dietType: 'veg' },
  { keys: ['cottage cheese', 'ricotta'], name: 'Ricotta Cheese', unit: '0.5 cup (124g)', cal: 180, p: 14.0, c: 6.0, f: 12.0, category: 'dairy', dietType: 'veg' },
  { keys: ['mozzarella', 'mozzarella cheese'], name: 'Mozzarella Cheese', unit: '30g', cal: 85, p: 6.0, c: 1.0, f: 6.0, category: 'dairy', dietType: 'veg' },
  { keys: ['cheese', 'cheddar', 'cheese slice'], name: 'Cheddar Cheese', unit: '1 slice (28g)', cal: 113, p: 7.0, c: 0.4, f: 9.3, category: 'dairy', dietType: 'veg' },

  // ===== LEGUMES & PULSES =====
  { keys: ['dal', 'lentil', 'lentil soup', 'yellow dal', 'moong dal', 'toor dal', 'daal'], name: 'Dal (cooked lentils)', unit: '1 bowl (150g)', cal: 150, p: 9.0, c: 20.0, f: 3.5, category: 'legume', dietType: 'veg' },
  { keys: ['masoor dal', 'red lentils'], name: 'Masoor Dal', unit: '1 bowl (150g)', cal: 140, p: 10.0, c: 22.0, f: 1.0, category: 'legume', dietType: 'veg' },
  { keys: ['chana dal'], name: 'Chana Dal', unit: '1 bowl (150g)', cal: 160, p: 10.5, c: 24.0, f: 2.5, category: 'legume', dietType: 'veg' },
  { keys: ['dal makhani', 'makhani dal', 'black dal'], name: 'Dal Makhani', unit: '1 bowl (200g)', cal: 280, p: 12.0, c: 28.0, f: 14.0, category: 'legume', dietType: 'veg' },
  { keys: ['chickpeas', 'chana', 'chole'], name: 'Cooked Chickpeas / Chole', unit: '1 bowl (150g)', cal: 240, p: 12.0, c: 40.0, f: 4.0, category: 'legume', dietType: 'veg' },
  { keys: ['kidney beans', 'rajma'], name: 'Kidney Beans / Rajma', unit: '1 bowl (150g)', cal: 215, p: 13.0, c: 38.0, f: 1.0, category: 'legume', dietType: 'veg' },
  { keys: ['sprouts', 'moong sprouts', 'sprouted moong'], name: 'Sprouts', unit: '1 bowl (100g)', cal: 85, p: 7.5, c: 12.0, f: 0.5, category: 'legume', dietType: 'veg' },
  { keys: ['soybeans', 'soya chunks', 'soya', 'soy'], name: 'Soya Chunks (cooked)', unit: '1 bowl (100g)', cal: 170, p: 26.0, c: 12.0, f: 1.0, perGram: 100, category: 'protein', dietType: 'vegan' },
  { keys: ['hummus'], name: 'Hummus', unit: '2 tbsp (30g)', cal: 70, p: 2.5, c: 6.0, f: 4.5, category: 'legume', dietType: 'vegan' },
  { keys: ['falafel'], name: 'Falafel', unit: '3 pieces (90g)', cal: 200, p: 8.0, c: 22.0, f: 9.0, category: 'legume', dietType: 'vegan' },
  { keys: ['lentil soup'], name: 'Lentil Soup', unit: '1 bowl (240ml)', cal: 170, p: 10.0, c: 28.0, f: 2.0, category: 'legume', dietType: 'vegan' },

  // ===== INDIAN CURRIES & DISHES (VEG) =====
  { keys: ['aloo gobi', 'potato cauliflower'], name: 'Aloo Gobi', unit: '1 serving (200g)', cal: 180, p: 4.0, c: 22.0, f: 9.0, category: 'vegetable', dietType: 'veg' },
  { keys: ['baingan bharta', 'baingan', 'eggplant bharta'], name: 'Baingan Bharta', unit: '1 serving (200g)', cal: 160, p: 3.5, c: 14.0, f: 10.0, category: 'vegetable', dietType: 'veg' },
  { keys: ['mixed veg curry', 'mixed vegetable', 'sabzi'], name: 'Mixed Veg Curry', unit: '1 serving (200g)', cal: 170, p: 5.0, c: 18.0, f: 8.5, category: 'vegetable', dietType: 'veg' },
  { keys: ['vegetable biryani', 'veg biryani'], name: 'Vegetable Biryani', unit: '1 plate (300g)', cal: 380, p: 8.0, c: 58.0, f: 13.0, category: 'grain', dietType: 'veg' },
  { keys: ['khichdi', 'moong dal khichdi'], name: 'Khichdi', unit: '1 bowl (250g)', cal: 220, p: 8.0, c: 36.0, f: 5.0, category: 'grain', dietType: 'veg' },
  { keys: ['pulao', 'veg pulao', 'vegetable pulao'], name: 'Veg Pulao', unit: '1 plate (250g)', cal: 300, p: 6.0, c: 50.0, f: 8.5, category: 'grain', dietType: 'veg' },
  { keys: ['jeera rice', 'cumin rice'], name: 'Jeera Rice', unit: '1 bowl (200g)', cal: 230, p: 4.5, c: 44.0, f: 4.5, category: 'grain', dietType: 'veg' },
  { keys: ['lemon rice'], name: 'Lemon Rice', unit: '1 bowl (200g)', cal: 240, p: 4.0, c: 45.0, f: 5.0, category: 'grain', dietType: 'veg' },
  { keys: ['sambar'], name: 'Sambar', unit: '1 bowl (200g)', cal: 130, p: 6.0, c: 18.0, f: 3.5, category: 'legume', dietType: 'veg' },
  { keys: ['rasam'], name: 'Rasam', unit: '1 bowl (200g)', cal: 45, p: 2.0, c: 8.0, f: 0.5, category: 'vegetable', dietType: 'veg' },
  { keys: ['bhindi masala', 'okra', 'bhindi'], name: 'Bhindi Masala', unit: '1 serving (150g)', cal: 120, p: 3.0, c: 12.0, f: 7.0, category: 'vegetable', dietType: 'veg' },
  { keys: ['matar paneer', 'peas paneer'], name: 'Matar Paneer', unit: '1 serving (200g)', cal: 310, p: 14.0, c: 14.0, f: 22.0, category: 'protein', dietType: 'veg' },
  { keys: ['chana masala', 'chole masala'], name: 'Chana Masala', unit: '1 serving (200g)', cal: 260, p: 12.0, c: 38.0, f: 7.0, category: 'legume', dietType: 'veg' },

  // ===== FRUITS =====
  { keys: ['banana', 'ripe banana', 'bananas'], name: 'Banana', unit: '1 medium (118g)', cal: 105, p: 1.3, c: 27.0, f: 0.3, category: 'fruit', dietType: 'veg' },
  { keys: ['apple', 'apples'], name: 'Apple', unit: '1 medium (182g)', cal: 95, p: 0.5, c: 25.0, f: 0.3, category: 'fruit', dietType: 'veg' },
  { keys: ['orange', 'oranges'], name: 'Orange', unit: '1 medium (131g)', cal: 62, p: 1.2, c: 15.4, f: 0.2, category: 'fruit', dietType: 'veg' },
  { keys: ['mango', 'mangoes'], name: 'Mango', unit: '1 cup sliced (165g)', cal: 99, p: 1.4, c: 25.0, f: 0.6, category: 'fruit', dietType: 'veg' },
  { keys: ['papaya'], name: 'Papaya', unit: '1 cup cubed (145g)', cal: 62, p: 0.7, c: 16.0, f: 0.4, category: 'fruit', dietType: 'veg' },
  { keys: ['watermelon'], name: 'Watermelon', unit: '1 cup diced (152g)', cal: 46, p: 0.9, c: 11.5, f: 0.2, category: 'fruit', dietType: 'veg' },
  { keys: ['grapes'], name: 'Grapes', unit: '1 cup (150g)', cal: 104, p: 1.1, c: 27.0, f: 0.2, category: 'fruit', dietType: 'veg' },
  { keys: ['pomegranate', 'anaar'], name: 'Pomegranate', unit: '1 cup seeds (174g)', cal: 144, p: 2.9, c: 33.0, f: 2.0, category: 'fruit', dietType: 'veg' },
  { keys: ['guava', 'amrood'], name: 'Guava', unit: '1 medium (55g)', cal: 37, p: 1.4, c: 8.0, f: 0.5, category: 'fruit', dietType: 'veg' },
  { keys: ['berries', 'mixed berries', 'blueberries', 'strawberries'], name: 'Mixed Berries', unit: '1 cup (150g)', cal: 70, p: 1.0, c: 17.0, f: 0.5, category: 'fruit', dietType: 'veg' },
  { keys: ['dates', 'khajur', 'medjool dates'], name: 'Dates', unit: '3 pieces (50g)', cal: 140, p: 1.0, c: 37.0, f: 0.1, category: 'fruit', dietType: 'veg' },

  // ===== VEGETABLES =====
  { keys: ['potato', 'boiled potato', 'potatoes'], name: 'Potato (boiled)', unit: '1 medium (173g)', cal: 160, p: 4.3, c: 37.0, f: 0.2, category: 'carb', dietType: 'veg' },
  { keys: ['sweet potato', 'sweet potatoes', 'shakarkandi'], name: 'Sweet Potato (baked)', unit: '1 medium (114g)', cal: 112, p: 2.0, c: 26.0, f: 0.1, category: 'carb', dietType: 'veg' },
  { keys: ['salad', 'green salad', 'mixed salad'], name: 'Garden Green Salad', unit: '1 bowl (100g)', cal: 45, p: 1.8, c: 8.0, f: 0.8, category: 'vegetable', dietType: 'veg' },
  { keys: ['broccoli'], name: 'Broccoli (steamed)', unit: '1 cup (91g)', cal: 35, p: 2.6, c: 6.0, f: 0.4, category: 'vegetable', dietType: 'veg' },
  { keys: ['spinach', 'palak', 'cooked spinach'], name: 'Spinach (cooked)', unit: '1 cup (180g)', cal: 40, p: 5.0, c: 7.0, f: 0.5, category: 'vegetable', dietType: 'veg' },
  { keys: ['cauliflower', 'gobi'], name: 'Cauliflower (cooked)', unit: '1 cup (124g)', cal: 29, p: 2.2, c: 5.0, f: 0.3, category: 'vegetable', dietType: 'veg' },
  { keys: ['green beans', 'french beans'], name: 'Green Beans', unit: '1 cup (125g)', cal: 35, p: 2.0, c: 7.0, f: 0.2, category: 'vegetable', dietType: 'veg' },
  { keys: ['mushroom', 'mushrooms'], name: 'Mushrooms (cooked)', unit: '1 cup (156g)', cal: 44, p: 3.4, c: 8.0, f: 0.5, category: 'vegetable', dietType: 'veg' },
  { keys: ['tomato', 'tomatoes'], name: 'Tomato', unit: '1 medium (123g)', cal: 22, p: 1.1, c: 4.8, f: 0.2, category: 'vegetable', dietType: 'veg' },
  { keys: ['cucumber', 'kheera'], name: 'Cucumber', unit: '1 medium (200g)', cal: 30, p: 1.4, c: 6.0, f: 0.2, category: 'vegetable', dietType: 'veg' },
  { keys: ['carrot', 'carrots', 'gajar'], name: 'Carrot', unit: '1 medium (61g)', cal: 25, p: 0.6, c: 6.0, f: 0.1, category: 'vegetable', dietType: 'veg' },
  { keys: ['bell pepper', 'capsicum', 'shimla mirch'], name: 'Bell Pepper', unit: '1 medium (120g)', cal: 30, p: 1.2, c: 6.0, f: 0.3, category: 'vegetable', dietType: 'veg' },
  { keys: ['avocado'], name: 'Avocado', unit: '0.5 fruit (68g)', cal: 114, p: 1.3, c: 6.0, f: 10.5, category: 'fat', dietType: 'vegan' },
  { keys: ['corn', 'sweet corn', 'bhutta'], name: 'Sweet Corn', unit: '1 ear (90g)', cal: 85, p: 3.0, c: 19.0, f: 1.0, category: 'carb', dietType: 'veg' },
  { keys: ['grilled vegetables', 'roasted vegetables', 'grilled veggies'], name: 'Grilled Vegetables', unit: '1 cup (180g)', cal: 100, p: 3.0, c: 15.0, f: 4.0, category: 'vegetable', dietType: 'vegan' },
  { keys: ['roasted sweet potato'], name: 'Roasted Sweet Potato', unit: '1 cup (200g)', cal: 180, p: 4.0, c: 42.0, f: 0.3, category: 'carb', dietType: 'vegan' },

  // ===== NUTS, FATS & SPREADS =====
  { keys: ['peanut butter', 'pb'], name: 'Peanut Butter', unit: '1 tbsp (16g)', cal: 95, p: 4.0, c: 3.2, f: 8.0, category: 'fat', dietType: 'veg' },
  { keys: ['almonds', 'badam'], name: 'Almonds', unit: '1 handful (28g)', cal: 164, p: 6.0, c: 6.0, f: 14.0, category: 'fat', dietType: 'veg' },
  { keys: ['walnuts', 'akhrot'], name: 'Walnuts', unit: '1 handful (28g)', cal: 185, p: 4.3, c: 3.9, f: 18.5, category: 'fat', dietType: 'veg' },
  { keys: ['cashews', 'kaju'], name: 'Cashews', unit: '1 handful (28g)', cal: 155, p: 5.2, c: 9.0, f: 12.5, category: 'fat', dietType: 'veg' },
  { keys: ['peanuts', 'moongphali'], name: 'Peanuts', unit: '1 handful (28g)', cal: 160, p: 7.0, c: 4.5, f: 14.0, category: 'fat', dietType: 'veg' },
  { keys: ['flax seeds', 'alsi'], name: 'Flax Seeds', unit: '1 tbsp (10g)', cal: 55, p: 2.0, c: 3.0, f: 4.3, category: 'fat', dietType: 'vegan' },
  { keys: ['chia seeds'], name: 'Chia Seeds', unit: '1 tbsp (12g)', cal: 58, p: 2.0, c: 5.0, f: 3.7, category: 'fat', dietType: 'vegan' },
  { keys: ['olive oil', 'oil'], name: 'Olive Oil', unit: '1 tbsp (14g)', cal: 120, p: 0, c: 0, f: 13.5, category: 'fat', dietType: 'vegan' },
  { keys: ['coconut oil'], name: 'Coconut Oil', unit: '1 tbsp (14g)', cal: 121, p: 0, c: 0, f: 13.5, category: 'fat', dietType: 'vegan' },
  { keys: ['butter', 'ghee'], name: 'Butter / Ghee', unit: '1 tbsp (14g)', cal: 102, p: 0.1, c: 0, f: 11.5, category: 'fat', dietType: 'veg' },

  // ===== SOUPS & LIGHT MEALS =====
  { keys: ['chicken soup', 'chicken broth'], name: 'Chicken Soup', unit: '1 bowl (240ml)', cal: 120, p: 10.0, c: 10.0, f: 4.0, category: 'protein', dietType: 'nonveg' },
  { keys: ['minestrone', 'vegetable soup', 'veg soup'], name: 'Vegetable Soup', unit: '1 bowl (240ml)', cal: 90, p: 3.5, c: 16.0, f: 1.5, category: 'vegetable', dietType: 'vegan' },
  { keys: ['tomato soup'], name: 'Tomato Soup', unit: '1 bowl (240ml)', cal: 100, p: 2.5, c: 18.0, f: 2.0, category: 'vegetable', dietType: 'veg' },

  // ===== SNACKS & MISC =====
  { keys: ['pav bhaji'], name: 'Pav Bhaji', unit: '1 plate (300g)', cal: 400, p: 10.0, c: 52.0, f: 18.0, category: 'grain', dietType: 'veg' },
  { keys: ['samosa'], name: 'Samosa', unit: '1 piece (80g)', cal: 240, p: 4.0, c: 26.0, f: 13.0, category: 'grain', dietType: 'veg' },
  { keys: ['vada pav'], name: 'Vada Pav', unit: '1 piece (150g)', cal: 290, p: 6.0, c: 38.0, f: 13.0, category: 'grain', dietType: 'veg' },
  { keys: ['dahi vada', 'dahi bhalla'], name: 'Dahi Vada', unit: '2 pieces (150g)', cal: 200, p: 7.0, c: 28.0, f: 7.0, category: 'legume', dietType: 'veg' }
];

function parseSingleFoodItem(text) {
  const clean = text.toLowerCase().trim();
  if (!clean) return null;

  let gramMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:g|grams|gm)\b/);
  let numMatch = clean.match(/^(\d+(?:\.\d+)?)\s+/);
  let wordNum = 1;

  if (clean.includes('half ') || clean.startsWith('1/2')) wordNum = 0.5;
  else if (clean.includes('one ')) wordNum = 1;
  else if (clean.includes('two ')) wordNum = 2;
  else if (clean.includes('three ')) wordNum = 3;
  else if (clean.includes('four ')) wordNum = 4;
  else if (clean.includes('five ')) wordNum = 5;

  let matchedFood = null;
  let matchedKey = '';

  for (const item of NUTRITION_DATABASE) {
    for (const key of item.keys) {
      if (clean.includes(key)) {
        if (!matchedKey || key.length > matchedKey.length) {
          matchedFood = item;
          matchedKey = key;
        }
      }
    }
  }

  if (!matchedFood) return null;

  let multiplier = 1;
  if (gramMatch && matchedFood.perGram) {
    multiplier = parseFloat(gramMatch[1]) / matchedFood.perGram;
  } else if (numMatch) {
    multiplier = parseFloat(numMatch[1]);
  } else {
    multiplier = wordNum;
  }

  return {
    name: `${matchedFood.name} (${multiplier === 1 ? matchedFood.unit : multiplier + 'x ' + matchedFood.unit})`,
    calories: Math.round(matchedFood.cal * multiplier),
    protein: Math.round(matchedFood.p * multiplier * 10) / 10,
    carbs: Math.round(matchedFood.c * multiplier * 10) / 10,
    fat: Math.round(matchedFood.f * multiplier * 10) / 10,
    confidence: 'high'
  };
}

function calculateFoodNutrition(query) {
  if (!query || !query.trim()) return null;
  const parts = query.split(/\s*(?:with|and|\+|\&|,)\s*/i);
  let total = { name: [], calories: 0, protein: 0, carbs: 0, fat: 0, confidence: 'high' };
  let found = 0;

  for (const part of parts) {
    const res = parseSingleFoodItem(part);
    if (res) {
      found++;
      total.name.push(res.name);
      total.calories += res.calories;
      total.protein += res.protein;
      total.carbs += res.carbs;
      total.fat += res.fat;
    }
  }

  if (found === 0) {
    return parseSingleFoodItem(query);
  }

  return {
    name: total.name.join(' + ') || query,
    calories: Math.round(total.calories),
    protein: Math.round(total.protein * 10) / 10,
    carbs: Math.round(total.carbs * 10) / 10,
    fat: Math.round(total.fat * 10) / 10,
    confidence: 'high',
    source: 'instant_calc'
  };
}

// AI Food & Meal Scanner Helper (Server-side proxy with client-side fallback)
async function callGeminiFoodApi(apiKey, promptText, inlineData = null) {
  if (!navigator.onLine) {
    throw new Error('You’re offline. Food AI lookup requires an active internet connection.');
  }

  // 1. Primary: Server-side secure AI endpoint
  try {
    const resp = await fetch('/api/ai/analyze-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptText, inlineData })
    });
    if (resp.ok) {
      const result = await resp.json();
      if (result.ok && result.data) {
        return result.data;
      }
    } else {
      const errObj = await resp.json().catch(() => ({}));
      if (resp.status !== 503 || !apiKey) {
        throw new Error(errObj.error || `Server AI error (${resp.status})`);
      }
    }
  } catch (backendErr) {
    if (!apiKey) {
      throw backendErr;
    }
  }

  // 2. Fallback: Direct client-side call if a local override key is provided
  if (apiKey) {
    const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
    let parts = [{ text: promptText }];
    if (inlineData) {
      parts.push({ inlineData });
    }

    let lastErr = null;
    for (const model of models) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
            })
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          return JSON.parse(cleanJson);
        } else {
          const errObj = await resp.json().catch(() => ({}));
          lastErr = new Error(errObj?.error?.message || `HTTP ${resp.status}`);
        }
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Gemini API call failed');
  }
}

// ==========================================
// 4. EXERCISE DATABASE (80+ EXERCISES)
// Push/Pull/Legs/HIIT/Core with trackable metadata
// ==========================================
const EXERCISE_DATABASE = [
  // --- PUSH (22) ---
  { id: 'p1', name: 'Standing Overhead EZ Bar Press', muscleGroup: 'Shoulders', movementType: 'push', requiredEquipment: ['EZ / curl bar', 'Weight plates'], difficulty: 'Intermediate', trackable: true, trackingConfig: { joint: 'elbow', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion', 'back_stays_upright'] } },
  { id: 'p2', name: 'Plate Front Raises', muscleGroup: 'Shoulders', movementType: 'push', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'shoulder', side: 'both', downAngle: 20, upAngle: 90, formChecks: ['full_range_of_motion', 'back_stays_upright'] } },
  { id: 'p3', name: 'Plate Lateral Raises', muscleGroup: 'Shoulders', movementType: 'push', requiredEquipment: ['Weight plates'], difficulty: 'Intermediate', trackable: true, trackingConfig: { joint: 'shoulder', side: 'both', downAngle: 25, upAngle: 85, formChecks: ['full_range_of_motion', 'no_swinging'] } },
  { id: 'p4', name: 'Dumbbell Shoulder Press', muscleGroup: 'Shoulders', movementType: 'push', requiredEquipment: ['Adjustable dumbbells'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'elbow', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion', 'back_stays_upright'] } },
  { id: 'p5', name: 'Dumbbell Triceps Kickbacks', muscleGroup: 'Triceps', movementType: 'push', requiredEquipment: ['Adjustable dumbbells'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'elbow', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion'] } },
  { id: 'p6', name: 'Floor Chest Press (EZ Bar)', muscleGroup: 'Chest', movementType: 'push', requiredEquipment: ['EZ / curl bar', 'Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'p7', name: 'EZ Bar Skull Crushers (Floor)', muscleGroup: 'Triceps', movementType: 'push', requiredEquipment: ['EZ / curl bar', 'Weight plates'], difficulty: 'Intermediate', trackable: false },
  { id: 'p8', name: 'Close-Grip EZ Bar Floor Press', muscleGroup: 'Triceps/Chest', movementType: 'push', requiredEquipment: ['EZ / curl bar', 'Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'p9', name: 'Plate Overhead Tricep Extension', muscleGroup: 'Triceps', movementType: 'push', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'p10', name: 'Pushups', muscleGroup: 'Chest', movementType: 'push', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'p11', name: 'Diamond Pushups', muscleGroup: 'Triceps', movementType: 'push', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },
  { id: 'p12', name: 'Pike Pushups', muscleGroup: 'Shoulders', movementType: 'push', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },
  { id: 'p13', name: 'Decline Pushups (Elevated)', muscleGroup: 'Chest/Shoulders', movementType: 'push', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },
  { id: 'p14', name: 'Chair Dips / Bench Dips', muscleGroup: 'Triceps', movementType: 'push', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'p15', name: 'Single-Arm Plate Floor Press', muscleGroup: 'Chest', movementType: 'push', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'p16', name: 'Barbell Bench Press', muscleGroup: 'Chest', movementType: 'push', requiredEquipment: ['Barbell', 'Bench', 'Weight plates'], difficulty: 'Intermediate', trackable: false },
  { id: 'p17', name: 'Overhead Barbell Press', muscleGroup: 'Shoulders', movementType: 'push', requiredEquipment: ['Barbell', 'Weight plates'], difficulty: 'Intermediate', trackable: true, trackingConfig: { joint: 'elbow', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion', 'back_stays_upright'] } },
  { id: 'p18', name: 'Dumbbell Floor Press', muscleGroup: 'Chest', movementType: 'push', requiredEquipment: ['Adjustable dumbbells'], difficulty: 'Beginner', trackable: false },
  { id: 'p19', name: 'Dumbbell Lateral Raises', muscleGroup: 'Shoulders', movementType: 'push', requiredEquipment: ['Adjustable dumbbells'], difficulty: 'Intermediate', trackable: true, trackingConfig: { joint: 'shoulder', side: 'both', downAngle: 25, upAngle: 85, formChecks: ['full_range_of_motion', 'no_swinging'] } },
  { id: 'p20', name: 'Resistance Band Chest Press', muscleGroup: 'Chest', movementType: 'push', requiredEquipment: ['Resistance bands'], difficulty: 'Beginner', trackable: false },
  { id: 'p21', name: 'Resistance Band Overhead Press', muscleGroup: 'Shoulders', movementType: 'push', requiredEquipment: ['Resistance bands'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'elbow', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion'] } },
  { id: 'p22', name: 'Archer Pushups', muscleGroup: 'Chest', movementType: 'push', requiredEquipment: [], difficulty: 'Advanced', trackable: false },

  // --- PULL (20) ---
  { id: 'pl1', name: 'Standing EZ Bar Bicep Curl', muscleGroup: 'Biceps', movementType: 'pull', requiredEquipment: ['EZ / curl bar', 'Weight plates'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'elbow', side: 'both', downAngle: 155, upAngle: 50, formChecks: ['full_range_of_motion', 'no_swinging'] } },
  { id: 'pl2', name: 'Dumbbell Hammer Curls', muscleGroup: 'Biceps', movementType: 'pull', requiredEquipment: ['Adjustable dumbbells'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'elbow', side: 'both', downAngle: 155, upAngle: 55, formChecks: ['full_range_of_motion', 'no_swinging'] } },
  { id: 'pl3', name: 'Bent-Over EZ Bar Row', muscleGroup: 'Back', movementType: 'pull', requiredEquipment: ['EZ / curl bar', 'Weight plates'], difficulty: 'Intermediate', trackable: false },
  { id: 'pl4', name: 'EZ Bar Reverse Curls', muscleGroup: 'Forearms/Biceps', movementType: 'pull', requiredEquipment: ['EZ / curl bar', 'Weight plates'], difficulty: 'Intermediate', trackable: false },
  { id: 'pl5', name: 'Plate Upright Row', muscleGroup: 'Upper Back/Traps', movementType: 'pull', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'pl6', name: 'Plate Shrugs', muscleGroup: 'Traps', movementType: 'pull', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'pl7', name: 'Plate Pinch Carries', muscleGroup: 'Forearms/Grip', movementType: 'pull', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'pl8', name: 'Doorframe Bodyweight Rows', muscleGroup: 'Back', movementType: 'pull', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'pl9', name: 'Prone Cobra / Scapular Squeeze', muscleGroup: 'Upper Back', movementType: 'pull', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'pl10', name: 'Single-Arm Dumbbell Row', muscleGroup: 'Back', movementType: 'pull', requiredEquipment: ['Adjustable dumbbells'], difficulty: 'Beginner', trackable: false },
  { id: 'pl11', name: 'Standing Dumbbell Bicep Curls', muscleGroup: 'Biceps', movementType: 'pull', requiredEquipment: ['Adjustable dumbbells'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'elbow', side: 'both', downAngle: 155, upAngle: 50, formChecks: ['full_range_of_motion', 'no_swinging'] } },
  { id: 'pl12', name: 'Pull-ups', muscleGroup: 'Back/Lats', movementType: 'pull', requiredEquipment: ['Pull-up bar'], difficulty: 'Advanced', trackable: false },
  { id: 'pl13', name: 'Chin-ups', muscleGroup: 'Biceps/Back', movementType: 'pull', requiredEquipment: ['Pull-up bar'], difficulty: 'Intermediate', trackable: false },
  { id: 'pl14', name: 'Inverted Rows', muscleGroup: 'Back', movementType: 'pull', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },
  { id: 'pl15', name: 'Barbell Deadlift', muscleGroup: 'Posterior Chain', movementType: 'pull', requiredEquipment: ['Barbell', 'Weight plates'], difficulty: 'Advanced', trackable: false },
  { id: 'pl16', name: 'Barbell Bent-Over Row', muscleGroup: 'Back', movementType: 'pull', requiredEquipment: ['Barbell', 'Weight plates'], difficulty: 'Intermediate', trackable: false },
  { id: 'pl17', name: 'Resistance Band Face Pulls', muscleGroup: 'Rear Delts', movementType: 'pull', requiredEquipment: ['Resistance bands'], difficulty: 'Beginner', trackable: false },
  { id: 'pl18', name: 'Resistance Band Bicep Curls', muscleGroup: 'Biceps', movementType: 'pull', requiredEquipment: ['Resistance bands'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'elbow', side: 'both', downAngle: 150, upAngle: 55, formChecks: ['full_range_of_motion'] } },
  { id: 'pl19', name: 'Resistance Band Lat Rows', muscleGroup: 'Back', movementType: 'pull', requiredEquipment: ['Resistance bands'], difficulty: 'Beginner', trackable: false },
  { id: 'pl20', name: 'Towel Isometric Curls', muscleGroup: 'Biceps', movementType: 'pull', requiredEquipment: [], difficulty: 'Beginner', trackable: false },

  // --- LEGS (18) ---
  { id: 'l1', name: 'Goblet Squat (Holding Plate)', muscleGroup: 'Quads', movementType: 'legs', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'knee', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion', 'back_stays_upright'] } },
  { id: 'l2', name: 'Walking Lunges with Plate', muscleGroup: 'Quads/Glutes', movementType: 'legs', requiredEquipment: ['Weight plates'], difficulty: 'Intermediate', trackable: true, trackingConfig: { joint: 'knee', side: 'both', downAngle: 90, upAngle: 160, formChecks: ['full_range_of_motion', 'back_stays_upright'] } },
  { id: 'l3', name: 'Bodyweight Air Squats', muscleGroup: 'Quads', movementType: 'legs', requiredEquipment: [], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'knee', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion', 'back_stays_upright'] } },
  { id: 'l4', name: 'Plate Romanian Deadlift', muscleGroup: 'Hamstrings/Glutes', movementType: 'legs', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'l5', name: 'Standing Plate Calf Raises', muscleGroup: 'Calves', movementType: 'legs', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'l6', name: 'EZ Bar Back Squat', muscleGroup: 'Quads/Glutes', movementType: 'legs', requiredEquipment: ['EZ / curl bar', 'Weight plates'], difficulty: 'Intermediate', trackable: true, trackingConfig: { joint: 'knee', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion', 'back_stays_upright'] } },
  { id: 'l7', name: 'EZ Bar Romanian Deadlift', muscleGroup: 'Hamstrings', movementType: 'legs', requiredEquipment: ['EZ / curl bar', 'Weight plates'], difficulty: 'Intermediate', trackable: false },
  { id: 'l8', name: 'Bulgarian Split Squats', muscleGroup: 'Quads/Glutes', movementType: 'legs', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },
  { id: 'l9', name: 'Bodyweight Reverse Lunges', muscleGroup: 'Quads/Glutes', movementType: 'legs', requiredEquipment: [], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'knee', side: 'both', downAngle: 90, upAngle: 160, formChecks: ['full_range_of_motion', 'back_stays_upright'] } },
  { id: 'l10', name: 'Single-Leg Calf Raises', muscleGroup: 'Calves', movementType: 'legs', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'l11', name: 'Weighted Glute Bridges (with Plate)', muscleGroup: 'Glutes', movementType: 'legs', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'l12', name: 'Single-Leg Bodyweight RDL', muscleGroup: 'Hamstrings', movementType: 'legs', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },
  { id: 'l13', name: 'Dumbbell Step-Ups', muscleGroup: 'Quads', movementType: 'legs', requiredEquipment: ['Adjustable dumbbells'], difficulty: 'Beginner', trackable: false },
  { id: 'l14', name: 'Barbell Back Squat', muscleGroup: 'Quads', movementType: 'legs', requiredEquipment: ['Barbell', 'Weight plates'], difficulty: 'Intermediate', trackable: true, trackingConfig: { joint: 'knee', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion', 'back_stays_upright'] } },
  { id: 'l15', name: 'Resistance Band Squats', muscleGroup: 'Quads', movementType: 'legs', requiredEquipment: ['Resistance bands'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'knee', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion'] } },
  { id: 'l16', name: 'Wall Sit', muscleGroup: 'Quads', movementType: 'legs', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'l17', name: 'Sumo Squat with Plate', muscleGroup: 'Adductors/Glutes', movementType: 'legs', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: true, trackingConfig: { joint: 'knee', side: 'both', downAngle: 85, upAngle: 165, formChecks: ['full_range_of_motion'] } },
  { id: 'l18', name: 'Donkey Kicks', muscleGroup: 'Glutes', movementType: 'legs', requiredEquipment: [], difficulty: 'Beginner', trackable: false },

  // --- HIIT & CONDITIONING (12) ---
  { id: 'h1', name: 'Plate Clean and Press', muscleGroup: 'Full Body', movementType: 'hiit', requiredEquipment: ['Weight plates'], difficulty: 'Intermediate', trackable: false },
  { id: 'h2', name: 'Burpees', muscleGroup: 'Full Body', movementType: 'hiit', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },
  { id: 'h3', name: 'Mountain Climbers', muscleGroup: 'Full Body', movementType: 'hiit', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'h4', name: 'Jump Squats', muscleGroup: 'Lower Body', movementType: 'hiit', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },
  { id: 'h5', name: 'Plate Thrusters', muscleGroup: 'Full Body', movementType: 'hiit', requiredEquipment: ['Weight plates'], difficulty: 'Intermediate', trackable: false },
  { id: 'h6', name: 'High Knees Sprint', muscleGroup: 'Cardio', movementType: 'hiit', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'h7', name: 'Shadow Boxing Drills', muscleGroup: 'Full Body', movementType: 'hiit', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'h8', name: 'Plank Shoulder Taps', muscleGroup: 'Core/Shoulders', movementType: 'hiit', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'h9', name: 'Skater Jumps', muscleGroup: 'Cardio/Glutes', movementType: 'hiit', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'h10', name: 'Jumping Lunges', muscleGroup: 'Lower Body', movementType: 'hiit', requiredEquipment: [], difficulty: 'Advanced', trackable: false },
  { id: 'h11', name: 'Fast Feet Agility Drills', muscleGroup: 'Cardio', movementType: 'hiit', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'h12', name: 'Bear Crawls', muscleGroup: 'Full Body/Core', movementType: 'hiit', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },

  // --- CORE (12) ---
  { id: 'c1', name: 'Plate Russian Twists', muscleGroup: 'Core', movementType: 'core', requiredEquipment: ['Weight plates'], difficulty: 'Beginner', trackable: false },
  { id: 'c2', name: 'Forearm Plank', muscleGroup: 'Core', movementType: 'core', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'c3', name: 'Bicycle Crunches', muscleGroup: 'Core', movementType: 'core', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'c4', name: 'Hollow Body Hold', muscleGroup: 'Core', movementType: 'core', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },
  { id: 'c5', name: 'Dead Bug', muscleGroup: 'Core', movementType: 'core', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'c6', name: 'Hanging Leg Raises', muscleGroup: 'Core', movementType: 'core', requiredEquipment: ['Pull-up bar'], difficulty: 'Intermediate', trackable: false },
  { id: 'c7', name: 'Side Plank (Left & Right)', muscleGroup: 'Core/Obliques', movementType: 'core', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'c8', name: 'Flutter Kicks', muscleGroup: 'Lower Abs', movementType: 'core', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'c9', name: 'Abdominal V-Ups', muscleGroup: 'Core', movementType: 'core', requiredEquipment: [], difficulty: 'Intermediate', trackable: false },
  { id: 'c10', name: 'Reverse Crunches', muscleGroup: 'Lower Abs', movementType: 'core', requiredEquipment: [], difficulty: 'Beginner', trackable: false },
  { id: 'c11', name: 'Plate Overhead March / Carry', muscleGroup: 'Core/Stability', movementType: 'core', requiredEquipment: ['Weight plates'], difficulty: 'Intermediate', trackable: false },
  { id: 'c12', name: 'Bird Dog', muscleGroup: 'Core/Lower Back', movementType: 'core', requiredEquipment: [], difficulty: 'Beginner', trackable: false }
];

function isExerciseEligible(exercise, userEquipment) {
  if (!exercise.requiredEquipment || exercise.requiredEquipment.length === 0) return true;
  return exercise.requiredEquipment.every((req) => {
    return userEquipment.some((item) => {
      if (item === req) return true;
      if (req === 'Weight plates' && (item.includes('plate') || item.includes('kg'))) return true;
      if (req === 'EZ / curl bar' && (item.includes('curl') || item.includes('EZ'))) return true;
      if (req === 'Barbell' && item.toLowerCase().includes('barbell')) return true;
      if (req === 'Bench' && item.toLowerCase().includes('bench') && !item.toLowerCase().includes('no bench')) return true;
      return false;
    });
  });
}

function generateWorkoutPlan(userEquipment, profile, shuffleOffsets = {}) {
  const goal = profile?.goal || 'cut';
  let setsConfig = { sets: 3, reps: '10-15', restSec: 60 };
  if (goal === 'bulk') setsConfig = { sets: 4, reps: '6-10', restSec: 90 };
  else if (goal === 'cut' || goal === 'recomp') setsConfig = { sets: 3, reps: '12-15', restSec: 45 };

  const eligible = EXERCISE_DATABASE.filter((ex) => isExerciseEligible(ex, userEquipment));
  const pushPool = eligible.filter((e) => e.movementType === 'push');
  const pullPool = eligible.filter((e) => e.movementType === 'pull');
  const legsPool = eligible.filter((e) => e.movementType === 'legs');
  const hiitPool = eligible.filter((e) => e.movementType === 'hiit');
  const corePool = eligible.filter((e) => e.movementType === 'core');

  function buildDay(primaryPool, secondaryPools, count = 8, dayKey = 'day_1') {
    const seed = shuffleOffsets[dayKey] || 0;
    const shuffled = [...primaryPool].sort((a, b) => {
      const hashA = (a.name.charCodeAt(0) * 31 + a.id.length * 13 + seed * 7) % 23;
      const hashB = (b.name.charCodeAt(0) * 31 + b.id.length * 13 + seed * 7) % 23;
      return hashA - hashB;
    });

    const chosen = [...shuffled];
    if (chosen.length < count) {
      for (const pool of secondaryPools) {
        for (const item of pool) {
          if (chosen.length >= count) break;
          if (!chosen.some((c) => c.id === item.id)) chosen.push(item);
        }
        if (chosen.length >= count) break;
      }
    }

    return chosen.slice(0, Math.max(count, chosen.length)).map((ex, idx) => ({
      ...ex,
      order: idx + 1,
      sets: setsConfig.sets,
      reps: setsConfig.reps,
      restSec: setsConfig.restSec
    }));
  }

  return [
    { dayId: 'day_1', dayLabel: 'Day 1 · Push Power', focus: 'Chest, Triceps & Shoulders', exercises: buildDay(pushPool, [corePool, hiitPool], 8, 'day_1') },
    { dayId: 'day_2', dayLabel: 'Day 2 · Pull Strength', focus: 'Back, Biceps & Traps', exercises: buildDay(pullPool, [corePool, hiitPool], 8, 'day_2') },
    { dayId: 'day_3', dayLabel: 'Day 3 · Legs & Posterior', focus: 'Quads, Hamstrings & Calves', exercises: buildDay(legsPool, [corePool, hiitPool], 8, 'day_3') },
    { dayId: 'day_4', dayLabel: 'Day 4 · HIIT & Core', focus: 'Metabolic Conditioning & Core', exercises: buildDay([...hiitPool, ...corePool], [legsPool, pushPool], 8, 'day_4') },
    { dayId: 'day_5', dayLabel: 'Day 5 · Push Hypertrophy', focus: 'Delts, Triceps & Upper Chest', exercises: buildDay(pushPool, [corePool, hiitPool], 8, 'day_5') },
    { dayId: 'day_6', dayLabel: 'Day 6 · Pull Hypertrophy', focus: 'Lats, Rhomboids & Arm Flexors', exercises: buildDay(pullPool, [corePool, hiitPool], 8, 'day_6') },
    { dayId: 'day_7', dayLabel: 'Day 7 · Active Recovery', focus: 'Mobility, Stretching & Soft Tissue', exercises: [] }
  ];
}

function calculateJointAngle(a, b, c) {
  if (!a || !b || !c) return 180;
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return Math.round(angle);
}

// ==========================================
// 5. SVG ICONS (Clean Athletic Styling)
// ==========================================
const Icons = {
  Google: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
    </svg>
  ),
  Dashboard: ({ className = 'w-5 h-5', active }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  Workout: ({ className = 'w-5 h-5', active }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12" />
    </svg>
  ),
  Food: ({ className = 'w-5 h-5', active }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  ),
  Profile: ({ className = 'w-5 h-5', active }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Camera: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Flame: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z" />
    </svg>
  ),
  Check: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Plus: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Minus: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  ChevronRight: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Refresh: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  Play: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  Trash: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Settings: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Download: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Upload: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Search: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  ArrowLeft: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  CheckCircle: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Diet: ({ className = 'w-5 h-5', active }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.4' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
      <path d="M12 22V12" />
      <path d="M12 12L2 7" />
      <path d="M12 12l10-5" />
    </svg>
  ),
  Crown: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20" />
      <path d="M4 20V9l4 3 4-7 4 7 4-3v11" />
    </svg>
  ),
  Lock: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="3" ry="3" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  ShoppingCart: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  Star: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  Video: ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  )
};

// ==========================================
// 6. ANIMATED NUMBER COMPONENT
// Counts up smoothly to new value instead of snapping
// ==========================================
function AnimatedNumber({ value, duration = 500, prefix = '', suffix = '' }) {
  const [displayValue, setDisplayValue] = useState(value);
  const startValRef = useRef(value);

  useEffect(() => {
    let startTimestamp = null;
    const fromVal = startValRef.current;
    const toVal = value;
    if (fromVal === toVal) {
      setDisplayValue(toVal);
      return;
    }
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(fromVal + (toVal - fromVal) * ease));
      if (progress < 1) requestAnimationFrame(step);
      else startValRef.current = toVal;
    };
    requestAnimationFrame(step);
  }, [value, duration]);

  return <span>{prefix}{displayValue.toLocaleString()}{suffix}</span>;
}

// ==========================================
// 7. PURE SVG 7-DAY WEIGHT TREND CHART
// ==========================================
function WeightTrendChart({ weightLogs = [] }) {
  const sorted = useMemo(() => {
    return [...weightLogs].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-7);
  }, [weightLogs]);

  if (sorted.length < 2) {
    return (
      <div className="h-28 flex flex-col items-center justify-center border border-zinc-800/80 rounded-2xl bg-[#101014] text-center p-4">
        <p className="text-xs font-semibold text-zinc-500">Log at least 2 entries to display your 7-day trend line.</p>
      </div>
    );
  }

  const weights = sorted.map((d) => d.weightKg);
  const minW = Math.floor(Math.min(...weights) - 1);
  const maxW = Math.ceil(Math.max(...weights) + 1);
  const range = maxW - minW || 1;
  const width = 340, height = 110, paddingX = 24, paddingY = 18;

  const points = sorted.map((d, idx) => {
    const x = paddingX + (idx / (sorted.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((d.weightKg - minW) / range) * (height - paddingY * 2);
    return { x, y, weight: d.weightKg, date: d.date.slice(5) };
  });

  const pathD = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;
  const delta = (weights[weights.length - 1] - weights[0]).toFixed(1);
  const deltaColor = delta < 0 ? 'text-[#3478F7]' : delta > 0 ? 'text-[#EC562E]' : 'text-zinc-400';

  return (
    <div className="bg-[#101014] border border-zinc-800/80 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">7-Day Weight Trend</span>
          <div className="text-xl font-black text-white">{weights[weights.length - 1]} kg</div>
        </div>
        <div className={`text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 ${deltaColor}`}>
          {delta > 0 ? `+${delta} kg` : `${delta} kg`}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24 overflow-visible">
        <defs>
          <linearGradient id="weightAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3478F7" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3478F7" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#26262B" strokeDasharray="3 3" />
        <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="#26262B" strokeDasharray="3 3" />
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#26262B" strokeDasharray="3 3" />
        <path d={areaD} fill="url(#weightAreaGrad)" />
        <path d={pathD} fill="none" stroke="#3478F7" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((pt, i) => (
          <g key={i}>
            <circle cx={pt.x} cy={pt.y} r="3.5" fill="#000000" stroke="#3478F7" strokeWidth="2.2" />
            <text x={pt.x} y={height - 3} textAnchor="middle" fill="#71717A" fontSize="8.5" fontWeight="600">{pt.date}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ==========================================
// 8. GUIDED SESSION MODE & REST TIMER
// Full-screen sequential auto-advancing flow
// ==========================================
function GuidedSessionMode({ workoutDay, profile, onSaveWorkout, onExit, isPro, userKeys, onOpenPaywall }) {
  const exercises = workoutDay.exercises || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [repsThisSet, setRepsThisSet] = useState(10);
  const [status, setStatus] = useState('active'); // 'active' | 'resting' | 'done'
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [sessionStartTime] = useState(Date.now());
  const [totalCompletedSets, setTotalCompletedSets] = useState(0);
  const [setLogs, setSetLogs] = useState([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [completionBanner, setCompletionBanner] = useState(null);

  const currentExercise = exercises[currentIndex];
  const nextExercise = exercises[currentIndex + 1];
  const isFinalExercise = currentIndex === exercises.length - 1;

  useEffect(() => {
    if (currentExercise) {
      const repMatch = (currentExercise.reps || '10').toString().match(/\d+/);
      const defaultRep = repMatch ? parseInt(repMatch[0], 10) : 10;
      setRepsThisSet(defaultRep);
    }
  }, [currentIndex, currentExercise]);

  useEffect(() => {
    let timer = null;
    if (status === 'resting' && restSecondsLeft > 0) {
      timer = setInterval(() => {
        setRestSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setStatus('active');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status, restSecondsLeft]);

  const handleCompleteSet = (trackedReps = null, formFlags = []) => {
    if ((trackedReps !== null || cameraActive) && !isPro && userKeys) {
      recordCameraUsage(userKeys);
    }
    const finalReps = trackedReps !== null ? trackedReps : repsThisSet;
    const logEntry = {
      exerciseName: currentExercise.name,
      setNumber: currentSet,
      reps: finalReps,
      formFlags
    };
    const newLogs = [...setLogs, logEntry];
    setSetLogs(newLogs);
    setTotalCompletedSets((prev) => prev + 1);

    const targetSets = currentExercise.sets || 3;
    const restDuration = currentExercise.restSec || 60;

    if (currentSet < targetSets) {
      setCurrentSet((prev) => prev + 1);
      setRestSecondsLeft(restDuration);
      setStatus('resting');
      setCameraActive(false);
    } else {
      if (isFinalExercise) {
        setStatus('done');
        setCameraActive(false);
        const durationSec = Math.round((Date.now() - sessionStartTime) / 1000);
        onSaveWorkout({
          dayLabel: workoutDay.dayLabel,
          exercisesDone: exercises.map((e) => e.name),
          totalSets: totalCompletedSets + 1,
          durationSec,
          logs: newLogs
        });
      } else {
        setCompletionBanner(`${currentExercise.name} Complete!`);
        setTimeout(() => setCompletionBanner(null), 2400);
        setCurrentIndex((prev) => prev + 1);
        setCurrentSet(1);
        setRestSecondsLeft(restDuration);
        setStatus('resting');
        setCameraActive(false);
      }
    }
  };

  const handleSkipRest = () => {
    setRestSecondsLeft(0);
    setStatus('active');
  };

  const handlePreviousExercise = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setCurrentSet(1);
      setStatus('active');
      setRestSecondsLeft(0);
      setCameraActive(false);
    }
  };

  if (status === 'done') {
    const totalMinutes = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));
    return (
      <div className="fixed inset-0 z-50 bg-[#000000] flex flex-col items-center justify-center p-6 text-center screen-spring-enter">
        <div className="w-20 h-20 rounded-3xl bg-[#3478F7]/20 border border-[#3478F7]/40 flex items-center justify-center mb-6 text-[#3478F7] check-spring">
          <Icons.CheckCircle className="w-10 h-10" />
        </div>
        <span className="text-xs font-black tracking-widest text-[#EC562E] uppercase mb-1">Session Concluded</span>
        <h1 className="text-3xl font-black text-white mb-2">{workoutDay.dayLabel}</h1>
        <p className="text-sm text-zinc-400 max-w-xs mb-8">All targeted sets locked in and logged to your athletic training history.</p>
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
          <div className="bg-[#101014] border border-zinc-800/80 rounded-2xl p-4 text-center">
            <span className="text-xs font-semibold text-zinc-500 uppercase">Sets Completed</span>
            <div className="text-2xl font-black text-white mt-1">{totalCompletedSets}</div>
          </div>
          <div className="bg-[#101014] border border-zinc-800/80 rounded-2xl p-4 text-center">
            <span className="text-xs font-semibold text-zinc-500 uppercase">Duration</span>
            <div className="text-2xl font-black text-[#3478F7] mt-1">{totalMinutes} min</div>
          </div>
        </div>
        <button
          onClick={onExit}
          className="w-full max-w-sm py-4 rounded-2xl bg-[#3478F7] hover:bg-blue-600 active:scale-95 transition-all text-white font-black text-base shadow-lg shadow-[#3478F7]/30 tap-spring"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#000000] flex flex-col text-white select-none">
      <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-900 bg-black/80 backdrop-blur-md">
        <button
          onClick={() => setShowExitConfirm(true)}
          className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white tap-spring"
        >
          Exit Session
        </button>
        <div className="text-center">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{workoutDay.dayLabel}</span>
          <div className="text-xs font-black text-zinc-300">
            Exercise {currentIndex + 1} of {exercises.length}
          </div>
        </div>
        {currentIndex > 0 ? (
          <button
            onClick={handlePreviousExercise}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white tap-spring"
          >
            Prev
          </button>
        ) : (
          <div className="w-12" />
        )}
      </div>

      {completionBanner && (
        <div className="absolute top-16 left-6 right-6 z-40 bg-[#3478F7] text-white py-2.5 px-4 rounded-xl text-center text-xs font-black shadow-xl shadow-[#3478F7]/40 check-spring">
          {completionBanner}
        </div>
      )}

      <div className="flex-1 flex flex-col justify-between p-6 max-w-md mx-auto w-full overflow-y-auto no-scrollbar">
        {status === 'resting' ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center screen-spring-enter my-auto">
            <span className="text-xs font-black text-[#EC562E] uppercase tracking-widest mb-3">Rest & Recover</span>
            <div className="relative w-48 h-48 flex items-center justify-center mb-6">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" stroke="#1D1D22" strokeWidth="7" fill="none" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="#3478F7"
                  strokeWidth="7"
                  fill="none"
                  strokeDasharray="264"
                  strokeDashoffset={264 - (264 * restSecondsLeft) / (currentExercise.restSec || 60)}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-5xl font-black text-white">{restSecondsLeft}</span>
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Seconds</span>
              </div>
            </div>
            <button
              onClick={handleSkipRest}
              className="px-6 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white hover:border-zinc-700 tap-spring mb-6"
            >
              Skip Rest Timer
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center screen-spring-enter my-auto">
            <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-6 mb-6 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black text-[#3478F7] uppercase tracking-wider">
                  {currentExercise.muscleGroup}
                </span>
                <span className="text-xs font-bold text-zinc-500 bg-zinc-900 px-2.5 py-1 rounded-full border border-zinc-800">
                  Set {currentSet} of {currentExercise.sets || 3}
                </span>
              </div>

              <h2 className="text-2xl font-black text-white leading-tight mb-2">{currentExercise.name}</h2>
              <p className="text-xs text-zinc-400 mb-6">Target: {currentExercise.reps} reps · {currentExercise.difficulty}</p>

              <div className="bg-[#000000] border border-zinc-800/90 rounded-2xl p-4 flex items-center justify-between mb-6">
                <button
                  onClick={() => setRepsThisSet((prev) => Math.max(1, prev - 1))}
                  className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white active:scale-90 transition-all tap-spring"
                >
                  <Icons.Minus className="w-5 h-5" />
                </button>

                <div className="text-center">
                  <span className="text-4xl font-black text-white tracking-tight">{repsThisSet}</span>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Reps Done</div>
                </div>

                <button
                  onClick={() => setRepsThisSet((prev) => prev + 1)}
                  className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white active:scale-90 transition-all tap-spring"
                >
                  <Icons.Plus className="w-5 h-5" />
                </button>
              </div>

              {currentExercise.trackable && (() => {
                const cameraCheck = canUseCameraTracking(userKeys, isPro);
                if (!isPro && !cameraCheck.allowed) {
                  return (
                    <div className="mb-3 p-3.5 rounded-2xl bg-[#16161A] border border-zinc-800 text-center space-y-1.5 screen-spring-enter shadow-lg">
                      <div className="flex items-center justify-center space-x-1.5 text-xs font-bold text-zinc-300">
                        <Icons.Camera className="w-4 h-4 text-[#EC562E]" />
                        <span>Camera tracking limit reached (3 sets / 7 days)</span>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Manual rep counter is active below. Upgrade for unlimited camera form-check.
                      </p>
                      <button
                        type="button"
                        onClick={onOpenPaywall}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#3478F7]/20 border border-[#3478F7]/40 text-xs font-bold text-[#3478F7] hover:bg-[#3478F7]/30 tap-spring mt-1"
                      >
                        <Icons.Crown className="w-3.5 h-3.5" />
                        <span>Upgrade for Unlimited</span>
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="mb-3 space-y-1">
                    <button
                      onClick={() => setCameraActive((prev) => !prev)}
                      className={`w-full py-3 px-4 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition-all tap-spring ${
                        cameraActive
                          ? 'bg-[#3478F7]/20 border-[#3478F7] text-[#3478F7]'
                          : 'bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <Icons.Camera className="w-4 h-4" />
                      <span>{cameraActive ? 'Camera Tracking Active' : 'Track with Camera (Auto-Count)'}</span>
                    </button>
                    {!isPro && (
                      <div className="text-center text-[10px] text-zinc-500">
                        {cameraCheck.remaining} of 3 free camera sets left this week
                      </div>
                    )}
                  </div>
                );
              })()}

              <button
                onClick={() => handleCompleteSet(null, [])}
                className="w-full py-4 rounded-2xl bg-[#3478F7] hover:bg-blue-600 active:scale-95 transition-all text-white font-black text-sm shadow-xl shadow-[#3478F7]/25 tap-spring flex items-center justify-center space-x-2"
              >
                <Icons.Check className="w-4 h-4" />
                <span>Complete Set {currentSet}</span>
              </button>
            </div>
          </div>
        )}

        <div className="bg-[#101014] border border-zinc-800/60 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
              <Icons.Play className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Up Next</span>
              <div className="text-xs font-black text-zinc-200">
                {currentSet < (currentExercise.sets || 3)
                  ? `Set ${currentSet + 1} of ${currentExercise.name}`
                  : nextExercise
                  ? nextExercise.name
                  : 'Workout Finished'}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-zinc-500">
            {currentSet < (currentExercise.sets || 3)
              ? `${currentExercise.restSec || 60}s rest`
              : nextExercise
              ? `${nextExercise.sets || 3} sets`
              : 'Done'}
          </span>
        </div>
      </div>

      {cameraActive && currentExercise.trackable && (
        <CameraPoseTracker
          exercise={currentExercise}
          currentReps={repsThisSet}
          onRepCounted={(newCount) => setRepsThisSet(newCount)}
          onCompleteSet={(countedReps, flags) => handleCompleteSet(countedReps, flags)}
          onClose={() => setCameraActive(false)}
        />
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-[#16161A] border border-zinc-800 rounded-3xl p-6 max-w-sm w-full text-center screen-spring-enter">
            <h3 className="text-lg font-black text-white mb-2">Leave Session?</h3>
            <p className="text-xs text-zinc-400 mb-6">Completed sets will be preserved, but current session will end.</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 tap-spring"
              >
                Continue
              </button>
              <button
                onClick={onExit}
                className="py-3 rounded-xl bg-rose-600 text-xs font-bold text-white tap-spring"
              >
                Quit Workout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 9. CAMERA POSE TRACKER + AUTO REP COUNTER
// MediaPipe Tasks Vision on-device pose tracking
// ==========================================
function CameraPoseTracker({ exercise, currentReps, onRepCounted, onCompleteSet, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animFrameIdRef = useRef(null);

  const [hasPermission, setHasPermission] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState(true);
  const [loadingModel, setLoadingModel] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [liveReps, setLiveReps] = useState(currentReps);
  const [formTip, setFormTip] = useState(null);

  const repStateRef = useRef('neutral');
  const repsCountRef = useRef(currentReps);
  const formFlagsRef = useRef([]);

  const config = exercise.trackingConfig || {
    joint: 'elbow',
    downAngle: 155,
    upAngle: 50,
    formChecks: ['full_range_of_motion']
  };

  const handleAcceptPermission = async () => {
    setPermissionNotice(false);
    setLoadingModel(true);

    try {
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
      const { PoseLandmarker, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      const poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1
      });

      landmarkerRef.current = poseLandmarker;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setHasPermission(true);
          setLoadingModel(false);
          startPoseDetection();
        };
      }
    } catch (err) {
      
      setLoadingModel(false);
      setErrorMessage(
        'Camera access was denied or not supported on this device. You can continue with manual rep counting.'
      );
    }
  };

  const startPoseDetection = () => {
    let lastVideoTime = -1;

    const renderLoop = () => {
      if (videoRef.current && canvasRef.current && landmarkerRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
          lastVideoTime = video.currentTime;
          const startTimeMs = performance.now();
          const results = landmarkerRef.current.detectForVideo(video, startTimeMs);

          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (results.landmarks && results.landmarks[0]) {
            const landmarks = results.landmarks[0];
            drawAthleticSkeleton(ctx, landmarks, canvas.width, canvas.height);
            processRepCounting(landmarks);
          }
        }
      }
      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameIdRef.current = requestAnimationFrame(renderLoop);
  };

  const drawAthleticSkeleton = (ctx, lm, w, h) => {
    const connections = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24],
      [23, 25], [25, 27], [24, 26], [26, 28]
    ];

    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#3478F7';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(52, 120, 247, 0.4)';
    ctx.shadowBlur = 10;

    connections.forEach(([i, j]) => {
      if (lm[i] && lm[j] && lm[i].visibility > 0.4 && lm[j].visibility > 0.4) {
        ctx.beginPath();
        ctx.moveTo(lm[i].x * w, lm[i].y * h);
        ctx.lineTo(lm[j].x * w, lm[j].y * h);
        ctx.stroke();
      }
    });

    [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach((idx) => {
      const p = lm[idx];
      if (p && p.visibility > 0.4) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#EC562E';
        ctx.shadowColor = 'rgba(236, 86, 46, 0.8)';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#F3D2C6';
        ctx.stroke();
      }
    });

    ctx.restore();
  };

  const processRepCounting = (lm) => {
    let currentAngle = 180;

    if (config.joint === 'elbow') {
      currentAngle = calculateJointAngle(lm[12], lm[14], lm[16]);
    } else if (config.joint === 'shoulder') {
      currentAngle = calculateJointAngle(lm[24], lm[12], lm[14]);
    } else if (config.joint === 'knee') {
      currentAngle = calculateJointAngle(lm[24], lm[26], lm[28]);
    }

    const isDownwardExercise = config.downAngle > config.upAngle;
    const downThreshold = config.downAngle;
    const upThreshold = config.upAngle;

    if (isDownwardExercise) {
      if (currentAngle > downThreshold - 15) {
        if (repStateRef.current === 'up') {
          repsCountRef.current += 1;
          const newTotal = repsCountRef.current;
          setLiveReps(newTotal);
          onRepCounted(newTotal);
        }
        repStateRef.current = 'down';
      } else if (currentAngle < upThreshold + 15) {
        repStateRef.current = 'up';
      }
    } else {
      if (currentAngle < downThreshold + 15) {
        if (repStateRef.current === 'up') {
          repsCountRef.current += 1;
          const newTotal = repsCountRef.current;
          setLiveReps(newTotal);
          onRepCounted(newTotal);
        }
        repStateRef.current = 'down';
      } else if (currentAngle > upThreshold - 15) {
        repStateRef.current = 'up';
      }
    }

    if (config.formChecks.includes('back_stays_upright') && lm[12] && lm[24] && lm[26]) {
      const torsoAngle = calculateJointAngle(lm[12], lm[24], lm[26]);
      if (Math.abs(torsoAngle - 180) > 22) {
        if (!formTip) {
          setFormTip('Brace core & keep torso upright');
          setTimeout(() => setFormTip(null), 2500);
        }
      }
    }
  };

  useEffect(() => {
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  if (permissionNotice) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
        <div className="bg-[#101014] border border-zinc-800 rounded-3xl p-6 max-w-sm w-full text-center screen-spring-enter">
          <div className="w-16 h-16 rounded-2xl bg-[#3478F7]/20 border border-[#3478F7]/40 flex items-center justify-center mx-auto mb-4 text-[#3478F7]">
            <Icons.Camera className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-white mb-2">Camera Tracking</h3>
          <p className="text-xs text-zinc-400 leading-relaxed mb-6">
            Dead Lock needs your camera to count reps and check your form — nothing is recorded or leaves your device.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              className="py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 tap-spring"
            >
              Cancel
            </button>
            <button
              onClick={handleAcceptPermission}
              className="py-3 rounded-xl bg-[#3478F7] text-xs font-bold text-white tap-spring shadow-lg shadow-[#3478F7]/30"
            >
              Enable Camera
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
        <div className="bg-[#101014] border border-zinc-800 rounded-3xl p-6 max-w-sm w-full text-center">
          <p className="text-xs text-rose-300 leading-relaxed mb-6">{errorMessage}</p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-[#3478F7] text-xs font-bold text-white tap-spring"
          >
            Continue with Manual Counter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden">
      <div className="relative w-full h-full max-w-md flex items-center justify-center">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none"
        />

        <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-10">
          <div className="bg-black/70 backdrop-blur-md border border-zinc-800 rounded-2xl px-4 py-2 flex items-center space-x-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-black text-white uppercase tracking-wider">Tracking Active</span>
          </div>

          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-black/70 backdrop-blur-md border border-zinc-800 text-xs font-bold text-white hover:bg-zinc-800 tap-spring"
          >
            Close Feed
          </button>
        </div>

        <div className="absolute top-24 left-6 z-10 bg-black/80 backdrop-blur-md border border-zinc-800 rounded-3xl px-6 py-3 shadow-2xl">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Auto Counter</span>
          <span className="text-4xl font-black text-white">{liveReps}</span>
        </div>

        {formTip && (
          <div className="absolute bottom-28 left-6 right-6 z-20 bg-[#EC562E] text-white py-2.5 px-4 rounded-xl text-center text-xs font-bold shadow-xl shadow-[#EC562E]/30 screen-spring-enter">
            {formTip}
          </div>
        )}

        <div className="absolute bottom-6 left-6 right-6 z-10">
          <button
            onClick={() => {
              onCompleteSet(liveReps, formFlagsRef.current);
              onClose();
            }}
            className="w-full py-4 rounded-2xl bg-[#3478F7] hover:bg-blue-600 active:scale-95 transition-all text-white font-black text-sm shadow-xl shadow-[#3478F7]/40 tap-spring"
          >
            Complete Set ({liveReps} Reps)
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 10. FOOD TAB (Photo Scan + AI Typed + Manual)
// Strict logger with Gemini API integration
// ==========================================
function FoodTab({ 
  foodLogs = [], 
  profile, 
  apiKey, 
  onSaveFood, 
  onDeleteFood, 
  onOpenSettings,
  isPro,
  scanCredits = 0,
  userKeys,
  onOpenPaywall,
  onUseCredit
}) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [typedInput, setTypedInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editableResult, setEditableResult] = useState(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  const [scanLimitNotice, setScanLimitNotice] = useState(null);

  const fileInputRef = useRef(null);
  const targets = useMemo(() => calculateMacros(profile), [profile]);

  const todaysLogs = useMemo(() => {
    return foodLogs.filter((item) => item.date === selectedDate);
  }, [foodLogs, selectedDate]);

  const dayTotals = useMemo(() => {
    return todaysLogs.reduce(
      (acc, item) => ({
        calories: acc.calories + (Number(item.calories) || 0),
        protein: acc.protein + (Number(item.protein) || 0),
        carbs: acc.carbs + (Number(item.carbs) || 0),
        fat: acc.fat + (Number(item.fat) || 0)
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [todaysLogs]);

  const caloriesRemaining = Math.max(0, targets.targetCalories - dayTotals.calories);
  const proteinRemaining = Math.max(0, targets.protein - dayTotals.protein);

  const handleAnalyzeText = async (e) => {
    if (e) e.preventDefault();
    const query = typedInput.trim();
    if (!query) return;

    // 1. Instant local calculation from built-in nutrition database (always free and instant)
    const localEst = calculateFoodNutrition(query);
    if (localEst) {
      setEditableResult({
        name: localEst.name || query,
        calories: localEst.calories,
        protein: localEst.protein,
        carbs: localEst.carbs,
        fat: localEst.fat,
        confidence: localEst.confidence || 'high',
        source: 'instant_calc'
      });
      setTypedInput('');
    }

    // Check free-tier AI quota
    const quota = canUseAiScan(userKeys, isPro);
    let spentCredit = false;

    if (!isPro && !quota.allowed) {
      const availCredits = userKeys ? getScanCredits(userKeys) : 0;
      if (availCredits > 0 && userKeys) {
        useScanCredit(userKeys);
        spentCredit = true;
        if (onUseCredit) onUseCredit();
      } else {
        // Limit reached and no credits: keep local offline calculation and display inline note
        setScanLimitNotice({
          message: 'Daily AI scan limit reached (3 of 3 free daily scans used). Showing offline calculation. Upgrade to Pro for unlimited AI scans, or purchase scan credits.'
        });
        if (!localEst) {
          setEditableResult({
            name: query,
            calories: 120,
            protein: 6,
            carbs: 18,
            fat: 3,
            confidence: 'low',
            source: 'estimate'
          });
          setTypedInput('');
        }
        return;
      }
    }

    // 2. Enhance with AI in background (via server-side endpoint)
    setIsAnalyzing(true);
    try {
      const promptText = `Analyze this food item and return ONLY a strict JSON object with this exact schema: {"name": string, "calories": number, "protein": number, "carbs": number, "fat": number, "confidence": "low"|"medium"|"high"}. If no quantity is specified, assume a standard single serving size. Food: "${query}"`;
      const parsed = await callGeminiFoodApi(apiKey, promptText);

      if (parsed && (parsed.calories !== undefined || parsed.name)) {
        setEditableResult({
          name: parsed.name || (localEst ? localEst.name : query),
          calories: Math.round(Number(parsed.calories) || (localEst ? localEst.calories : 100)),
          protein: Math.round(Number(parsed.protein) || (localEst ? localEst.protein : 5)),
          carbs: Math.round(Number(parsed.carbs) || (localEst ? localEst.carbs : 15)),
          fat: Math.round(Number(parsed.fat) || (localEst ? localEst.fat : 2)),
          confidence: parsed.confidence || 'high',
          source: 'ai_text'
        });
        setTypedInput('');
        if (!isPro && !spentCredit && userKeys) {
          recordAiScanUsage(userKeys);
        }
      }
    } catch (err) {
      // If local already set, keep it seamlessly; otherwise fallback estimate
      if (!localEst) {
        setEditableResult({
          name: query,
          calories: 120,
          protein: 6,
          carbs: 18,
          fat: 3,
          confidence: 'low',
          source: 'estimate'
        });
        setTypedInput('');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check free-tier AI quota
    const quota = canUseAiScan(userKeys, isPro);
    let spentCredit = false;

    if (!isPro && !quota.allowed) {
      const availCredits = userKeys ? getScanCredits(userKeys) : 0;
      if (availCredits > 0 && userKeys) {
        useScanCredit(userKeys);
        spentCredit = true;
        if (onUseCredit) onUseCredit();
      } else {
        setScanLimitNotice({
          message: 'Daily AI photo scan limit reached (3 of 3 free daily scans used). Upgrade to Pro for unlimited plate scans, or purchase scan credits.'
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    setIsAnalyzing(true);
    try {
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 1000;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });

      const photoId = 'photo_' + Date.now();
      await savePhotoToDb(photoId, base64);

      const rawBase64 = base64.split(',')[1];
      const promptText = `Analyze the food in this image and return ONLY a strict JSON object with this exact schema: {"name": string, "calories": number, "protein": number, "carbs": number, "fat": number, "confidence": "low"|"medium"|"high"}.`;

      const parsed = await callGeminiFoodApi(apiKey, promptText, { mimeType: 'image/jpeg', data: rawBase64 });

      setEditableResult({
        name: parsed.name || 'Identified Food Plate',
        calories: Math.round(Number(parsed.calories) || 0),
        protein: Math.round(Number(parsed.protein) || 0),
        carbs: Math.round(Number(parsed.carbs) || 0),
        fat: Math.round(Number(parsed.fat) || 0),
        confidence: parsed.confidence || 'medium',
        source: 'ai_photo',
        photoRef: photoId
      });

      if (!isPro && !spentCredit && userKeys) {
        recordAiScanUsage(userKeys);
      }
    } catch (err) {
      alert(err.message || 'Photo analysis failed. Please verify internet connection or server AI configuration.');
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveResult = () => {
    if (!editableResult) return;
    onSaveFood({
      id: 'food_' + Date.now(),
      date: selectedDate,
      timestamp: Date.now(),
      ...editableResult
    });
    setEditableResult(null);
  };

  const handleSaveManual = (e) => {
    e.preventDefault();
    const foodName = manualForm.name.trim();
    if (!foodName) return;

    let cals = parseInt(manualForm.calories, 10);
    let prot = parseInt(manualForm.protein, 10);
    let carb = parseInt(manualForm.carbs, 10);
    let fat = parseInt(manualForm.fat, 10);

    // If calories is blank or 0, auto-calculate from nutrition database
    if (isNaN(cals) || cals === 0) {
      const autoEst = calculateFoodNutrition(foodName);
      if (autoEst) {
        cals = autoEst.calories;
        if (isNaN(prot)) prot = autoEst.protein;
        if (isNaN(carb)) carb = autoEst.carbs;
        if (isNaN(fat)) fat = autoEst.fat;
      } else {
        cals = 0;
      }
    }

    onSaveFood({
      id: 'food_' + Date.now(),
      date: selectedDate,
      timestamp: Date.now(),
      name: foodName,
      calories: isNaN(cals) ? 0 : cals,
      protein: isNaN(prot) ? 0 : prot,
      carbs: isNaN(carb) ? 0 : carb,
      fat: isNaN(fat) ? 0 : fat,
      confidence: 'high',
      source: 'manual'
    });

    setManualForm({ name: '', calories: '', protein: '', carbs: '', fat: '' });
    setShowManualModal(false);
  };

  return (
    <div className="pb-28 max-w-md mx-auto px-5 pt-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Nutrition Engine</span>
          <h1 className="text-2xl font-black text-white">Food Logger</h1>
        </div>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#3478F7]"
        />
      </div>

      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400">Calories Remaining</span>
            <div className="text-2xl font-black text-white">
              <AnimatedNumber value={caloriesRemaining} /> <span className="text-xs font-bold text-zinc-500">kcal</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-semibold text-zinc-400">Protein Remaining</span>
            <div className="text-2xl font-black text-[#3478F7]">
              <AnimatedNumber value={proteinRemaining} /> <span className="text-xs font-bold text-zinc-500">g</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-zinc-900">
          <div>
            <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1">
              <span>CALORIES ({dayTotals.calories} / {targets.targetCalories} kcal)</span>
              <span>{Math.round((dayTotals.calories / targets.targetCalories) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full bg-[#3478F7] transition-all duration-700 rounded-full"
                style={{ width: `${Math.min(100, (dayTotals.calories / targets.targetCalories) * 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <div className="flex justify-between text-[9px] font-bold text-zinc-500 mb-1">
                <span>PROTEIN</span>
                <span>{dayTotals.protein}g</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-[#3478F7] transition-all duration-700 rounded-full"
                  style={{ width: `${Math.min(100, (dayTotals.protein / targets.protein) * 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[9px] font-bold text-zinc-500 mb-1">
                <span>CARBS</span>
                <span>{dayTotals.carbs}g</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-zinc-400 transition-all duration-700 rounded-full"
                  style={{ width: `${Math.min(100, (dayTotals.carbs / targets.carbs) * 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[9px] font-bold text-zinc-500 mb-1">
                <span>FAT</span>
                <span>{dayTotals.fat}g</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-[#EC562E] transition-all duration-700 rounded-full"
                  style={{ width: `${Math.min(100, (dayTotals.fat / targets.fat) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleAnalyzeText} className="relative">
        <input
          type="text"
          value={typedInput}
          onChange={(e) => setTypedInput(e.target.value)}
          placeholder="e.g. 2 rotis with bowl of dal, 150g chicken"
          disabled={isAnalyzing}
          className="w-full pl-11 pr-24 py-4 rounded-2xl bg-[#101014] border border-zinc-800 text-sm font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#3478F7] transition-all"
        />
        <div className="absolute left-4 top-4 text-zinc-500">
          <Icons.Search className="w-5 h-5" />
        </div>
        <button
          type="submit"
          disabled={isAnalyzing || !typedInput.trim()}
          className="absolute right-2.5 top-2.5 px-4 py-2 rounded-xl bg-[#3478F7] hover:bg-blue-600 disabled:opacity-40 text-xs font-bold text-white transition-all tap-spring"
        >
          {isAnalyzing ? 'Analyzing...' : 'Log'}
        </button>
      </form>

      {/* Free Tier Quota & Usage Metering Indicator */}
      {!isPro && (
        <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1">
          <span>
            Daily free AI scans: {canUseAiScan(userKeys, isPro).remaining} of 3 remaining
          </span>
          {scanCredits > 0 ? (
            <span className="text-[#3478F7] font-bold">
              {scanCredits} scan credit{scanCredits === 1 ? '' : 's'} available
            </span>
          ) : (
            <button
              type="button"
              onClick={onOpenPaywall}
              className="text-[#3478F7] font-bold hover:underline"
            >
              Upgrade &rarr;
            </button>
          )}
        </div>
      )}

      {/* Inline Upgrade Note when limit reached */}
      {scanLimitNotice && (
        <div className="bg-[#16161A] border border-[#EC562E]/40 rounded-2xl p-3.5 space-y-2.5 screen-spring-enter shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm">⚡</span>
              <span className="text-xs font-bold text-white">AI Food Scan Limit Reached</span>
            </div>
            <button
              type="button"
              onClick={() => setScanLimitNotice(null)}
              className="text-zinc-500 hover:text-zinc-300 text-xs px-1"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            {scanLimitNotice.message}
          </p>
          <div className="flex items-center space-x-2 pt-0.5">
            <button
              type="button"
              onClick={onOpenPaywall}
              className="px-3 py-1.5 rounded-xl bg-[#3478F7] hover:bg-blue-600 text-white text-xs font-bold tap-spring shadow-md shadow-[#3478F7]/20"
            >
              Upgrade to Pro
            </button>
            <button
              type="button"
              onClick={onOpenPaywall}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-bold tap-spring"
            >
              Buy Scan Credits
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          capture="environment"
          onChange={handlePhotoUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isAnalyzing}
          className="py-3 px-4 rounded-2xl bg-[#101014] border border-zinc-800/90 hover:border-zinc-700 flex items-center justify-center space-x-2 text-xs font-bold text-zinc-300 tap-spring"
        >
          <Icons.Camera className="w-4 h-4 text-[#3478F7]" />
          <span>Scan Photo</span>
        </button>

        <button
          onClick={() => setShowManualModal(true)}
          className="py-3 px-4 rounded-2xl bg-[#101014] border border-zinc-800/90 hover:border-zinc-700 flex items-center justify-center space-x-2 text-xs font-bold text-zinc-300 tap-spring"
        >
          <Icons.Plus className="w-4 h-4 text-[#EC562E]" />
          <span>Manual Entry</span>
        </button>
      </div>

      {editableResult && (
        <div className="bg-[#16161A] border border-[#3478F7]/40 rounded-3xl p-5 shadow-2xl screen-spring-enter space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-[#3478F7] tracking-wider">
              Verify AI Estimate ({editableResult.source === 'ai_photo' ? 'Photo Scan' : 'Typed Input'})
            </span>
            <button
              onClick={() => setEditableResult(null)}
              className="text-xs text-zinc-500 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <input
            type="text"
            value={editableResult.name}
            onChange={(e) => setEditableResult({ ...editableResult, name: e.target.value })}
            className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-white"
          />

          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <span className="text-[9px] font-bold text-zinc-500 uppercase">Cals</span>
              <input
                type="number"
                value={editableResult.calories}
                onChange={(e) => setEditableResult({ ...editableResult, calories: parseInt(e.target.value, 10) || 0 })}
                className="w-full bg-black border border-zinc-800 rounded-lg py-1 text-xs font-bold text-white text-center mt-1"
              />
            </div>
            <div>
              <span className="text-[9px] font-bold text-zinc-500 uppercase">Protein</span>
              <input
                type="number"
                value={editableResult.protein}
                onChange={(e) => setEditableResult({ ...editableResult, protein: parseInt(e.target.value, 10) || 0 })}
                className="w-full bg-black border border-zinc-800 rounded-lg py-1 text-xs font-bold text-white text-center mt-1"
              />
            </div>
            <div>
              <span className="text-[9px] font-bold text-zinc-500 uppercase">Carbs</span>
              <input
                type="number"
                value={editableResult.carbs}
                onChange={(e) => setEditableResult({ ...editableResult, carbs: parseInt(e.target.value, 10) || 0 })}
                className="w-full bg-black border border-zinc-800 rounded-lg py-1 text-xs font-bold text-white text-center mt-1"
              />
            </div>
            <div>
              <span className="text-[9px] font-bold text-zinc-500 uppercase">Fat</span>
              <input
                type="number"
                value={editableResult.fat}
                onChange={(e) => setEditableResult({ ...editableResult, fat: parseInt(e.target.value, 10) || 0 })}
                className="w-full bg-black border border-zinc-800 rounded-lg py-1 text-xs font-bold text-white text-center mt-1"
              />
            </div>
          </div>

          <button
            onClick={handleSaveResult}
            className="w-full py-3.5 rounded-2xl bg-[#3478F7] hover:bg-blue-600 font-bold text-xs text-white tap-spring shadow-lg shadow-[#3478F7]/30"
          >
            Save to Log
          </button>
        </div>
      )}

      <div className="space-y-3">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Logged Today ({todaysLogs.length})</span>

        {todaysLogs.length === 0 ? (
          <div className="bg-[#101014] border border-zinc-800/80 rounded-2xl p-6 text-center text-xs text-zinc-500">
            No meals logged for this date yet. Use the search bar above or scan a plate.
          </div>
        ) : (
          todaysLogs.map((item) => (
            <div
              key={item.id}
              className="bg-[#101014] border border-zinc-800/80 rounded-2xl p-4 flex items-center justify-between tap-spring"
            >
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-white">{item.name}</h4>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                    {item.source === 'ai_photo' ? 'Photo' : item.source === 'ai_text' ? 'AI' : 'Manual'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 space-x-2 mt-1 font-semibold">
                  <span className="text-white">{item.calories} cal</span>
                  <span>·</span>
                  <span className="text-[#3478F7]">{item.protein}g P</span>
                  <span>·</span>
                  <span>{item.carbs}g C</span>
                  <span>·</span>
                  <span>{item.fat}g F</span>
                </div>
              </div>

              <button
                onClick={() => onDeleteFood(item.id)}
                className="text-zinc-600 hover:text-rose-400 p-2 tap-spring"
              >
                <Icons.Trash className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <form
            onSubmit={handleSaveManual}
            className="bg-[#16161A] border border-zinc-800 rounded-3xl p-6 max-w-sm w-full space-y-4 screen-spring-enter"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white">Manual Food Entry</h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Food Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Bread, 2 rotis, 3 eggs"
                value={manualForm.name}
                onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
              />
              {manualForm.name.trim().length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const est = calculateFoodNutrition(manualForm.name.trim());
                    if (est) {
                      setManualForm((prev) => ({
                        ...prev,
                        calories: est.calories,
                        protein: est.protein,
                        carbs: est.carbs,
                        fat: est.fat
                      }));
                    }
                  }}
                  className="mt-1.5 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-[#3478F7]/20 border border-[#3478F7]/40 text-[11px] font-bold text-[#3478F7] hover:bg-[#3478F7]/30 tap-spring"
                >
                  <span>✨ Auto-calculate macros for "{manualForm.name.trim()}"</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Calories</label>
                <input
                  type="number"
                  placeholder="240"
                  value={manualForm.calories}
                  onChange={(e) => setManualForm({ ...manualForm, calories: e.target.value })}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Protein (g)</label>
                <input
                  type="number"
                  placeholder="18"
                  value={manualForm.protein}
                  onChange={(e) => setManualForm({ ...manualForm, protein: e.target.value })}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Carbs (g)</label>
                <input
                  type="number"
                  placeholder="2"
                  value={manualForm.carbs}
                  onChange={(e) => setManualForm({ ...manualForm, carbs: e.target.value })}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Fat (g)</label>
                <input
                  type="number"
                  placeholder="14"
                  value={manualForm.fat}
                  onChange={(e) => setManualForm({ ...manualForm, fat: e.target.value })}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl bg-[#3478F7] text-white font-bold text-xs tap-spring shadow-lg shadow-[#3478F7]/30"
            >
              Add to Log
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 11. WORKOUT TAB (Day Selector & Checklist)
// ==========================================
function WorkoutTab({ workoutPlan, completedDates = [], equipment = [], profile, onStartSession, onRegenerateDay, onOpenEquipment }) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const currentDay = workoutPlan[selectedDayIndex] || workoutPlan[0];
  const hasEquipment = equipment && equipment.length > 0;

  return (
    <div className="pb-28 max-w-md mx-auto px-5 pt-4 space-y-5">
      {!hasEquipment && (
        <div className="bg-[#101014] border border-[#3478F7]/30 rounded-3xl p-5 text-center space-y-3 shadow-xl screen-spring-enter">
          <div className="w-12 h-12 rounded-2xl bg-[#3478F7]/20 border border-[#3478F7]/40 flex items-center justify-center mx-auto text-[#3478F7]">
            <Icons.Workout className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-black text-white">No Equipment Selected</h3>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
            Dead Lock filters your 6-day split based on what gear you own. Select your equipment to unlock targeted exercises.
          </p>
          <button
            onClick={onOpenEquipment}
            className="px-5 py-2.5 rounded-xl bg-[#3478F7] hover:bg-blue-600 active:scale-95 text-xs font-black text-white tap-spring shadow-lg shadow-[#3478F7]/25"
          >
            Select Available Gear
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Training Program</span>
          <h1 className="text-2xl font-black text-white">6-Day Split</h1>
        </div>

        <button
          onClick={onOpenEquipment}
          className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white tap-spring"
        >
          Gear ({equipment.length})
        </button>
      </div>

      <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-1">
        {workoutPlan.map((day, idx) => {
          const isSelected = selectedDayIndex === idx;
          return (
            <button
              key={day.dayId}
              onClick={() => setSelectedDayIndex(idx)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-black whitespace-nowrap transition-all tap-spring ${
                isSelected
                  ? 'bg-[#3478F7] text-white shadow-lg shadow-[#3478F7]/30'
                  : 'bg-[#101014] border border-zinc-800/80 text-zinc-400 hover:text-white'
              }`}
            >
              Day {idx + 1}
            </button>
          );
        })}
      </div>

      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] font-black text-[#EC562E] uppercase tracking-wider block">Target Movement</span>
            <h2 className="text-xl font-black text-white">{currentDay.dayLabel}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">{currentDay.focus}</p>
          </div>

          <button
            onClick={() => onRegenerateDay(currentDay.dayId)}
            className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 tap-spring"
            title="Regenerate this day with different exercises from your equipment pool"
          >
            <Icons.Refresh className="w-4 h-4" />
          </button>
        </div>

        {currentDay.exercises.length > 0 ? (
          <button
            onClick={() => onStartSession(currentDay)}
            className="w-full py-4 rounded-2xl bg-[#3478F7] hover:bg-blue-600 active:scale-95 transition-all text-white font-black text-sm shadow-xl shadow-[#3478F7]/30 flex items-center justify-center space-x-2 tap-spring"
          >
            <Icons.Play className="w-4 h-4" />
            <span>Launch Guided Session ({currentDay.exercises.length} Exercises)</span>
          </button>
        ) : (
          <div className="py-3 text-center text-xs font-bold text-zinc-500">
            Active Rest & Mobility Day. Foam roll, stretch, and recover.
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        <div className="flex justify-between items-center px-1">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Exercises ({currentDay.exercises.length})
          </span>
          <span className="text-[11px] font-semibold text-zinc-500">Ordered Progression</span>
        </div>

        {currentDay.exercises.map((ex, index) => (
          <div
            key={ex.id}
            className="bg-[#101014] border border-zinc-800/80 rounded-2xl p-4 flex items-center justify-between tap-spring"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-7 h-7 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-black flex items-center justify-center">
                {index + 1}
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-white">{ex.name}</h4>
                  {ex.trackable && (
                    <span className="px-1.5 py-0.5 rounded bg-[#3478F7]/15 border border-[#3478F7]/30 text-[#3478F7] text-[9px] font-black uppercase">
                      Vision
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-400 font-semibold mt-0.5">
                  {ex.sets} sets · {ex.reps} reps · {ex.muscleGroup}
                </div>
              </div>
            </div>

            <div className="text-[11px] font-bold text-zinc-500 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
              {ex.restSec}s rest
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 12. DASHBOARD TAB (Default Landing View)
// Today snapshot, streak, and 7-day weight chart
// ==========================================
function DashboardTab({ profile, workoutLogs = [], foodLogs = [], weightLogs = [], todayWorkoutDay, onStartWorkout, onLogWeight, onOpenSettings }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const targets = useMemo(() => calculateMacros(profile), [profile]);
  const [weightInput, setWeightInput] = useState('');

  const workoutDoneToday = workoutLogs.some((l) => l.date === todayStr);
  const foodLoggedToday = foodLogs.some((l) => l.date === todayStr);

  const todayFood = foodLogs.filter((l) => l.date === todayStr);
  const todayCalories = todayFood.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
  const todayProtein = todayFood.reduce((sum, item) => sum + (Number(item.protein) || 0), 0);

  const streak = useMemo(() => {
    let count = 0;
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const hasWorkout = workoutLogs.some((w) => w.date === dateKey);
      const hasFood = foodLogs.some((f) => f.date === dateKey);
      if (hasWorkout && hasFood) {
        count++;
      } else if (i === 0) {
        continue;
      } else {
        break;
      }
    }
    return count;
  }, [workoutLogs, foodLogs]);

  const handleSaveWeight = (e) => {
    e.preventDefault();
    const val = parseFloat(weightInput);
    if (!val || val <= 20 || val >= 300) return;
    onLogWeight(todayStr, val);
    setWeightInput('');
  };

  return (
    <div className="pb-28 max-w-md mx-auto px-5 pt-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Performance Command</span>
          <h1 className="text-2xl font-black tracking-tight text-white font-['Archivo_Black',sans-serif]">DEAD // LOCK</h1>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white tap-spring"
        >
          <Icons.Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-gradient-to-r from-[#16161A] to-[#101014] border border-[#EC562E]/30 rounded-3xl p-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#EC562E]/20 border border-[#EC562E]/40 flex items-center justify-center text-[#EC562E]">
            <Icons.Flame className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-black text-[#EC562E] uppercase tracking-wider">Discipline Index</span>
            <div className="text-lg font-black text-white">
              {streak} Day Streak
            </div>
          </div>
        </div>
        <span className="text-xs text-zinc-400 font-semibold">Dual Logged</span>
      </div>

      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Today's Training</span>
          {workoutDoneToday ? (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase border border-emerald-500/30">
              Completed
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-[#EC562E]/20 text-[#EC562E] text-[10px] font-black uppercase border border-[#EC562E]/30">
              Pending
            </span>
          )}
        </div>

        <div>
          <h3 className="text-lg font-black text-white">{todayWorkoutDay.dayLabel}</h3>
          <p className="text-xs text-zinc-400 mt-0.5">{todayWorkoutDay.focus} · {todayWorkoutDay.exercises.length} Exercises</p>
        </div>

        {!workoutDoneToday && todayWorkoutDay.exercises.length > 0 && (
          <button
            onClick={() => onStartWorkout(todayWorkoutDay)}
            className="w-full py-3.5 rounded-2xl bg-[#3478F7] hover:bg-blue-600 text-white font-black text-xs tap-spring shadow-lg shadow-[#3478F7]/30 flex items-center justify-center space-x-2"
          >
            <Icons.Play className="w-4 h-4" />
            <span>Start Today's Workout</span>
          </button>
        )}
      </div>

      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Nutrition Snapshot</span>
          <span className="text-xs font-semibold text-zinc-500">
            {todayCalories} / {targets.targetCalories} kcal
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-black border border-zinc-800 rounded-2xl p-3.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Calories Remaining</span>
            <div className="text-xl font-black text-white mt-1">
              <AnimatedNumber value={Math.max(0, targets.targetCalories - todayCalories)} />
            </div>
          </div>
          <div className="bg-black border border-zinc-800 rounded-2xl p-3.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Protein Remaining</span>
            <div className="text-xl font-black text-[#3478F7] mt-1">
              <AnimatedNumber value={Math.max(0, targets.protein - todayProtein)} />g
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <WeightTrendChart weightLogs={weightLogs} />

        <form onSubmit={handleSaveWeight} className="flex space-x-2">
          <input
            type="number"
            step="0.1"
            placeholder="Log today's weight (e.g. 79.5 kg)"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            className="flex-1 bg-[#101014] border border-zinc-800 rounded-2xl px-4 py-3 text-xs font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#3478F7]"
          />
          <button
            type="submit"
            disabled={!weightInput}
            className="px-5 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-40 text-xs font-bold text-zinc-200 tap-spring"
          >
            Log Weight
          </button>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 13. PROFILE & SETTINGS TAB
// Targets, backup export/import, and Gemini API key
// ==========================================
function ProfileTab({
  profile,
  equipment,
  apiKey,
  authUser,
  isPro,
  onOpenPaywall,
  onGoogleSignIn,
  onSignOut,
  onTriggerGoogleSignIn,
  onEditProfile,
  onEditEquipment,
  onSaveApiKey,
  onExportData,
  onImportData,
  onRequestResetData
}) {
  const targets = useMemo(() => calculateMacros(profile), [profile]);
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileImportRef = useRef(null);
  const currentPlatform = getRuntimePlatform();

  // Keep input synced if apiKey changes externally
  useEffect(() => {
    setKeyInput(apiKey || '');
  }, [apiKey]);

  const handleSaveKey = (e) => {
    e.preventDefault();
    onSaveApiKey(keyInput.trim());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        onImportData(event.target.result);
      } catch (err) {
        alert('Invalid backup JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="pb-28 max-w-md mx-auto px-5 pt-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Athlete Dossier</span>
          <h1 className="text-2xl font-black text-white">Profile & Config</h1>
        </div>

        <button
          onClick={onEditProfile}
          className="px-3.5 py-1.5 rounded-xl bg-[#3478F7]/15 border border-[#3478F7]/30 text-xs font-bold text-[#3478F7] tap-spring"
        >
          Edit Metrics
        </button>
      </div>

      {/* Subtle, non-naggy Pro Status & Upgrade Entry Point */}
      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-4 flex items-center justify-between shadow-2xl">
        <div className="flex items-center space-x-3">
          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center border shrink-0 ${
            isPro 
              ? 'bg-[#3478F7]/20 border-[#3478F7]/40 text-[#3478F7]' 
              : 'bg-[#EC562E]/15 border-[#EC562E]/30 text-[#EC562E]'
          }`}>
            <Icons.Crown className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-black text-white">Dead Lock {isPro ? 'Pro' : 'Free Tier'}</span>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                isPro 
                  ? 'bg-[#3478F7]/20 border-[#3478F7]/40 text-[#3478F7]' 
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}>
                {isPro ? 'PRO ACTIVE' : 'FREE'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {isPro 
                ? 'Unlimited AI vision, camera tracking, HD video workouts & custom diet plans' 
                : '3 camera sets/7d · 3 AI scans/day · HD video workouts & diet plan locked'}
            </p>
          </div>
        </div>
        {!isPro ? (
          <button
            onClick={onOpenPaywall}
            className="px-3.5 py-2 rounded-xl bg-[#3478F7] hover:bg-blue-600 text-xs font-bold text-white tap-spring shadow-lg shadow-[#3478F7]/20 shrink-0 ml-2"
          >
            Upgrade
          </button>
        ) : (
          <span className="text-xs font-bold text-[#3478F7] px-2 py-1 shrink-0">
            Unlocked
          </span>
        )}
      </div>

      {/* Cross-Platform Google OAuth Dossier Card */}
      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Icons.Google className="w-4 h-4" />
            <span className="text-xs font-black text-zinc-300 uppercase tracking-wider">Google OAuth Account</span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
            {currentPlatform.toUpperCase()} CLIENT
          </span>
        </div>

        {authUser ? (
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center space-x-3">
              {authUser.photoURL ? (
                <img src={authUser.photoURL} alt="Avatar" className="w-10 h-10 rounded-full border border-[#3478F7]/50 object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#3478F7]/20 border border-[#3478F7]/40 flex items-center justify-center font-black text-[#3478F7]">
                  {authUser.displayName ? authUser.displayName[0] : 'U'}
                </div>
              )}
              <div>
                <div className="text-sm font-black text-white">{authUser.displayName || 'Authenticated Athlete'}</div>
                <div className="text-xs text-zinc-400 truncate max-w-[170px]">{authUser.email}</div>
              </div>
            </div>
            <button
              onClick={onSignOut}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white tap-spring"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="pt-1 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-zinc-300">Guest Mode (Local Only)</div>
              <div className="text-[11px] text-zinc-500">Sign in to sync with Google on mobile</div>
            </div>
            <button
              onClick={onGoogleSignIn}
              className="px-3.5 py-2 rounded-xl bg-[#3478F7] hover:bg-blue-600 active:scale-95 text-xs font-bold text-white flex items-center space-x-2 tap-spring shadow-lg shadow-[#3478F7]/20"
            >
              <Icons.Google className="w-3.5 h-3.5" />
              <span>Connect</span>
            </button>
          </div>
        )}
      </div>

      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Calculated Macro Target</span>
          <span className="text-xs font-black text-[#EC562E] uppercase px-2.5 py-0.5 rounded bg-[#EC562E]/15 border border-[#EC562E]/30">
            {profile?.goal || 'Pending'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-black border border-zinc-800/90 rounded-2xl p-3">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Daily Budget</span>
            <div className="text-xl font-black text-white mt-0.5">{targets.targetCalories} kcal</div>
          </div>
          <div className="bg-black border border-zinc-800/90 rounded-2xl p-3">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Protein Target</span>
            <div className="text-xl font-black text-[#3478F7] mt-0.5">{targets.protein}g</div>
          </div>
          <div className="bg-black border border-zinc-800/90 rounded-2xl p-3">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Carb Target</span>
            <div className="text-xl font-black text-white mt-0.5">{targets.carbs}g</div>
          </div>
          <div className="bg-black border border-zinc-800/90 rounded-2xl p-3">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Fat Target</span>
            <div className="text-xl font-black text-[#EC562E] mt-0.5">{targets.fat}g</div>
          </div>
        </div>

        <div className="text-[11px] text-zinc-500 flex justify-between px-1 pt-1">
          <span>BMR: {targets.bmr} kcal</span>
          <span>TDEE: {targets.tdee} kcal</span>
          <span>Weight: {profile?.weightKg || 0} kg</span>
        </div>
      </div>

      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Registered Gear</span>
          <button
            onClick={onEditEquipment}
            className="text-xs font-bold text-[#3478F7] hover:underline tap-spring"
          >
            Modify
          </button>
        </div>

        {equipment && equipment.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {equipment.map((item) => (
              <span
                key={item}
                className="text-xs font-semibold px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300"
              >
                {item}
              </span>
            ))}
          </div>
        ) : (
          <div className="py-2 text-center">
            <p className="text-xs text-zinc-500 mb-2">No equipment selected yet.</p>
            <button
              onClick={onEditEquipment}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-[#3478F7] hover:text-white tap-spring"
            >
              + Add Available Gear
            </button>
          </div>
        )}
      </div>

      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">AI Nutrition & Vision Engine</span>
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1.5 animate-pulse"></span>
            Built-in AI Active
          </span>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Photo plate scanning and smart food macro lookups are powered directly by the Dead Lock Engine. No manual API setup needed.
        </p>

        <details className="text-xs text-zinc-600 pt-1">
          <summary className="cursor-pointer hover:text-zinc-400 transition-colors font-semibold text-[11px]">
            Advanced: Custom Gemini Key Override (Optional)
          </summary>
          <form onSubmit={handleSaveKey} className="flex space-x-2 mt-2.5">
            <input
              type="password"
              placeholder="Paste custom AI Studio Gemini Key..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="flex-1 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-[#3478F7]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#3478F7] text-xs font-bold text-white tap-spring"
            >
              {saveSuccess ? 'Saved!' : 'Save'}
            </button>
          </form>
        </details>
      </div>

      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3">
        <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">Data Management</span>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onExportData}
            className="py-3 px-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white flex items-center justify-center space-x-2 tap-spring"
          >
            <Icons.Download className="w-4 h-4" />
            <span>Export Backup</span>
          </button>

          <input
            type="file"
            ref={fileImportRef}
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileImportRef.current?.click()}
            className="py-3 px-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white flex items-center justify-center space-x-2 tap-spring"
          >
            <Icons.Upload className="w-4 h-4" />
            <span>Import Backup</span>
          </button>
        </div>

        <div className="pt-2 border-t border-zinc-900 space-y-2">
          <button
            onClick={onRequestResetData}
            className="w-full py-2.5 text-center text-xs font-bold text-rose-500 hover:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl tap-spring"
          >
            Reset App (Wipe Current Data)
          </button>
        </div>
      </div>

      {/* Legal Policies & Transparency */}
      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3">
        <span className="text-xs font-black text-zinc-400 uppercase tracking-wider block">Legal &amp; Policies</span>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 hover:text-white font-bold text-center tap-spring block"
          >
            Privacy Policy &rarr;
          </a>
          <a
            href="/terms.html"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 hover:text-white font-bold text-center tap-spring block"
          >
            Terms of Service &rarr;
          </a>
        </div>
      </div>

      {/* Real Contact & Support Card */}
      <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-2">
        <div className="flex items-center space-x-2">
          <span className="text-sm">📍</span>
          <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Dead Lock Labs Headquarters</span>
        </div>
        <div className="text-xs text-zinc-400 space-y-1">
          <p className="text-white font-bold">Dead Lock Systems Inc.</p>
          <p>100 Fitness Way, Suite 400, Austin, TX 78701</p>
          <p className="pt-1">Support: <a href="mailto:support@deadlockapp.com" className="text-[#3478F7] hover:underline">support@deadlockapp.com</a></p>
          <p>Privacy Inquiries: <a href="mailto:privacy@deadlockapp.com" className="text-[#3478F7] hover:underline">privacy@deadlockapp.com</a></p>
        </div>
      </div>

      <div className="pt-2 pb-4 text-center">
        <span className="text-[11px] font-black text-zinc-600 tracking-widest uppercase">
          DEAD // LOCK v{APP_VERSION} (BUILD {APP_BUILD})
        </span>
      </div>
    </div>
  );
}

// ==========================================
// 14. INTRO SCREEN (Heavy Condensed Wordmark) (Heavy Condensed Wordmark)
// Shown once before onboarding flow
// ==========================================
function IntroScreen({ onGetStarted, onGoogleSignIn, isAuthenticating }) {
  const platform = getRuntimePlatform();
  const platformLabel = platform === 'ios' ? 'Apple iOS' : (platform === 'android' ? 'Google Android' : 'Web Browser');

  return (
    <div className="fixed inset-0 z-50 bg-[#000000] flex flex-col justify-between p-8 text-center select-none screen-spring-enter">
      <div className="flex-1 flex flex-col items-center justify-center">
        <h1 className="text-6xl sm:text-7xl font-black text-white tracking-tighter leading-none font-['Archivo_Black',sans-serif] mb-3">
          DEAD // LOCK
        </h1>

        <div className="w-24 h-1.5 bg-[#3478F7] rounded-full mb-6" />

        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest max-w-xs mb-6">
          Equipment-Aware Training · Computer Vision · Precision Macros
        </p>

        <div className="flex items-center space-x-4 text-[11px] font-black text-[#EC562E] uppercase tracking-wider mb-6">
          <span>6-Day Split</span>
          <span>·</span>
          <span>Pose Tracking</span>
          <span>·</span>
          <span>Food Logger</span>
        </div>

        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#101014] border border-zinc-800 text-[11px] font-bold text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{platformLabel} OAuth Verified</span>
        </div>
      </div>

      <div className="w-full max-w-sm mx-auto space-y-3">
        <button
          onClick={onGoogleSignIn}
          disabled={isAuthenticating}
          className="w-full py-4 rounded-2xl bg-white hover:bg-zinc-100 active:scale-95 transition-all text-black font-black text-sm flex items-center justify-center space-x-3 shadow-2xl shadow-white/10 tap-spring"
        >
          {isAuthenticating ? (
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Icons.Google className="w-5 h-5" />
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <button
          onClick={onGetStarted}
          disabled={isAuthenticating}
          className="w-full py-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:scale-95 transition-all text-zinc-400 hover:text-white font-bold text-xs border border-zinc-800 tap-spring"
        >
          Continue as Guest
        </button>
      </div>
    </div>
  );
}

// ==========================================
// 15. 4-STEP ONBOARDING FLOW
// ==========================================
function OnboardingFlow({ initialProfile, onComplete }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(
    initialProfile || {
      age: '',
      heightCm: '',
      weightKg: '',
      sex: '',
      activityLevel: '',
      goal: ''
    }
  );

  const isStep1Valid = Boolean(
    form.sex &&
    form.age &&
    Number(form.age) > 0 &&
    form.heightCm &&
    Number(form.heightCm) > 0 &&
    form.weightKg &&
    Number(form.weightKg) > 0
  );
  const isStep2Valid = Boolean(form.activityLevel);
  const isStep3Valid = Boolean(form.goal);

  const calculated = useMemo(() => calculateMacros(form), [form]);

  return (
    <div className="fixed inset-0 z-50 bg-[#000000] flex flex-col justify-between p-6 max-w-md mx-auto text-white screen-spring-enter">
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center space-x-2">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="p-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white tap-spring"
            >
              <Icons.ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="text-xs font-black text-zinc-500 uppercase tracking-wider">Step {step} of 4</span>
        </div>

        <div className="flex space-x-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i <= step ? 'w-6 bg-[#3478F7]' : 'w-2 bg-zinc-800'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center my-6">
        {step === 1 && (
          <div className="space-y-5 screen-spring-enter">
            <div>
              <span className="text-xs font-black text-[#3478F7] uppercase tracking-wider">Step 1</span>
              <h2 className="text-2xl font-black text-white">Biometrics</h2>
              <p className="text-xs text-zinc-400 mt-1">Foundation metrics for your Mifflin-St Jeor metabolic engine.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {['male', 'female'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, sex: s })}
                  className={`py-3 rounded-2xl border text-xs font-bold capitalize transition-all tap-spring ${
                    form.sex === s
                      ? 'bg-[#3478F7] border-[#3478F7] text-white shadow-lg shadow-[#3478F7]/25'
                      : 'bg-[#101014] border-zinc-800 text-zinc-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Age</label>
                <input
                  type="number"
                  value={form.age}
                  placeholder="e.g. 26" onChange={(e) => setForm({ ...form, age: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                  className="w-full bg-[#101014] border border-zinc-800 rounded-2xl px-4 py-3 text-sm font-bold text-white mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Height (cm)</label>
                <input
                  type="number"
                  value={form.heightCm}
                  placeholder="e.g. 178" onChange={(e) => setForm({ ...form, heightCm: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                  className="w-full bg-[#101014] border border-zinc-800 rounded-2xl px-4 py-3 text-sm font-bold text-white mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase">Weight (kg)</label>
                <input
                  type="number"
                  value={form.weightKg}
                  placeholder="e.g. 78.5" onChange={(e) => setForm({ ...form, weightKg: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                  className="w-full bg-[#101014] border border-zinc-800 rounded-2xl px-4 py-3 text-sm font-bold text-white mt-1"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 screen-spring-enter">
            <div>
              <span className="text-xs font-black text-[#3478F7] uppercase tracking-wider">Step 2</span>
              <h2 className="text-2xl font-black text-white">Activity Level</h2>
              <p className="text-xs text-zinc-400 mt-1">Multiplies BMR into your Total Daily Energy Expenditure (TDEE).</p>
            </div>

            <div className="space-y-2.5">
              {[
                { id: 'sedentary', label: 'Sedentary', desc: 'Little to no exercise, desk job (1.2×)' },
                { id: 'light', label: 'Light', desc: 'Light training 1–3 days/week (1.375×)' },
                { id: 'moderate', label: 'Moderate', desc: 'Active lifting / cardio 3–5 days/week (1.55×)' },
                { id: 'very_active', label: 'Very Active', desc: 'Heavy daily training or physical labor (1.725×)' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setForm({ ...form, activityLevel: opt.id })}
                  className={`w-full p-4 rounded-2xl border text-left transition-all tap-spring ${
                    form.activityLevel === opt.id
                      ? 'bg-[#16161A] border-[#3478F7] shadow-xl shadow-[#3478F7]/20'
                      : 'bg-[#101014] border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{opt.label}</span>
                    {form.activityLevel === opt.id && <Icons.Check className="w-4 h-4 text-[#3478F7]" />}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 screen-spring-enter">
            <div>
              <span className="text-xs font-black text-[#EC562E] uppercase tracking-wider">Step 3</span>
              <h2 className="text-2xl font-black text-white">Physique Goal</h2>
              <p className="text-xs text-zinc-400 mt-1">Calibrated deficit, surplus, and protein targets.</p>
            </div>

            <div className="space-y-2.5">
              {[
                { id: 'cut', label: 'Cut (lose fat, keep muscle)', desc: '-500 kcal deficit, 2.2g/kg protein priority' },
                { id: 'bulk', label: 'Bulk (build muscle, surplus)', desc: '+300 kcal surplus, progressive overload strength focus' },
                { id: 'recomp', label: 'Recomp (lose fat + build muscle slowly)', desc: 'Maintenance caloric balance with high protein' },
                { id: 'maintain', label: 'Maintain', desc: 'Sustain current weight, steady metabolic health' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setForm({ ...form, goal: opt.id })}
                  className={`w-full p-4 rounded-2xl border text-left transition-all tap-spring ${
                    form.goal === opt.id
                      ? 'bg-[#16161A] border-[#EC562E] shadow-xl shadow-[#EC562E]/20'
                      : 'bg-[#101014] border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{opt.label}</span>
                    {form.goal === opt.id && <Icons.Check className="w-4 h-4 text-[#EC562E]" />}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5 screen-spring-enter">
            <div>
              <span className="text-xs font-black text-[#3478F7] uppercase tracking-wider">Step 4</span>
              <h2 className="text-2xl font-black text-white">Target Reveal</h2>
              <p className="text-xs text-zinc-400 mt-1">Your exact daily metabolic blueprint.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#101014] border border-zinc-800 rounded-3xl p-4 text-center">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Target Calories</span>
                <div className="text-2xl font-black text-white mt-1">
                  <AnimatedNumber value={calculated.targetCalories} /> <span className="text-xs text-zinc-500">kcal</span>
                </div>
              </div>

              <div className="bg-[#101014] border border-zinc-800 rounded-3xl p-4 text-center">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Protein Target</span>
                <div className="text-2xl font-black text-[#3478F7] mt-1">
                  <AnimatedNumber value={calculated.protein} /> <span className="text-xs text-zinc-500">g</span>
                </div>
              </div>

              <div className="bg-[#101014] border border-zinc-800 rounded-3xl p-4 text-center">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Carb Target</span>
                <div className="text-2xl font-black text-white mt-1">
                  <AnimatedNumber value={calculated.carbs} /> <span className="text-xs text-zinc-500">g</span>
                </div>
              </div>

              <div className="bg-[#101014] border border-zinc-800 rounded-3xl p-4 text-center">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Fat Target</span>
                <div className="text-2xl font-black text-[#EC562E] mt-1">
                  <AnimatedNumber value={calculated.fat} /> <span className="text-xs text-zinc-500">g</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-3 text-center text-xs text-zinc-500">
              Mifflin-St Jeor BMR: {calculated.bmr} kcal · TDEE: {calculated.tdee} kcal
            </div>
          </div>
        )}
      </div>

      <div>
        {step < 4 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={
              (step === 1 && !isStep1Valid) ||
              (step === 2 && !isStep2Valid) ||
              (step === 3 && !isStep3Valid)
            }
            className="w-full py-4 rounded-2xl bg-[#3478F7] hover:bg-blue-600 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all text-white font-black text-sm shadow-xl shadow-[#3478F7]/30 tap-spring"
          >
            Continue
          </button>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => onComplete(form)}
              className="w-full py-4 rounded-2xl bg-[#3478F7] hover:bg-blue-600 active:scale-95 transition-all text-white font-black text-sm shadow-xl shadow-[#3478F7]/30 tap-spring"
            >
              Confirm & Save Profile
            </button>
            <button
              onClick={() => setStep(1)}
              className="w-full py-2.5 text-center text-xs font-bold text-zinc-400 hover:text-white"
            >
              Edit Details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 16. EQUIPMENT SETUP MODAL (Prompt 2 spec)
// ==========================================
function EquipmentModal({ currentEquipment = [], onSave, onClose }) {
  const [selected, setSelected] = useState(currentEquipment || []);
  const [customTag, setCustomTag] = useState('');

  const toggleItem = (item) => {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const handleAddCustom = (e) => {
    e.preventDefault();
    if (!customTag.trim()) return;
    if (!selected.includes(customTag.trim())) {
      setSelected([...selected, customTag.trim()]);
    }
    setCustomTag('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-5 select-none">
      <div className="bg-[#16161A] border border-zinc-800 rounded-3xl p-6 max-w-sm w-full space-y-4 screen-spring-enter max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-[#3478F7] uppercase tracking-wider">Equipment Filter</span>
            <h3 className="text-lg font-black text-white">What Gear Do You Own?</h3>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-xs text-zinc-400 hover:text-white">
              ✕
            </button>
          )}
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Your 6-day split will only generate exercises possible with your selected gear. No bench required unless selected.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {DEFAULT_EQUIPMENT_OPTIONS.map((item) => {
            const isChecked = selected.includes(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggleItem(item)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all tap-spring ${
                  isChecked
                    ? 'bg-[#3478F7] border-[#3478F7] text-white shadow-md shadow-[#3478F7]/30'
                    : 'bg-[#101014] border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleAddCustom} className="flex space-x-2 pt-2">
          <input
            type="text"
            placeholder="Add custom tag (e.g. 20kg x2)"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            className="flex-1 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#3478F7]"
          />
          <button
            type="submit"
            disabled={!customTag.trim()}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white tap-spring disabled:opacity-40"
          >
            Add
          </button>
        </form>

        <div className="pt-2">
          <button
            onClick={() => onSave(selected)}
            className="w-full py-3.5 rounded-2xl bg-[#3478F7] hover:bg-blue-600 text-white font-black text-xs tap-spring shadow-lg shadow-[#3478F7]/30"
          >
            Save Equipment ({selected.length} Selected)
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAYWALL SCREEN
// ==========================================
function PaywallScreen({ isOpen, onClose, onPurchaseSuccess, isPro, scanCredits, userKeys }) {
  const [purchaseState, setPurchaseState] = useState('idle');
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const [monthlyPrice, setMonthlyPrice] = useState('₹149/mo');
  const [yearlyPrice, setYearlyPrice] = useState('₹999/yr');
  const [credits50Price, setCredits50Price] = useState('₹49');
  const [credits200Price, setCredits200Price] = useState('₹149');
  const [productsAvailable, setProductsAvailable] = useState(true);

  // Calculate approximate per-month equivalent for yearly - MUST BE AT TOP LEVEL BEFORE ANY RETURN
  const yearlyPerMonth = useMemo(() => {
    const num = parseFloat(yearlyPrice.replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > 0) {
      const perMo = Math.round(num / 12);
      const symbol = yearlyPrice.includes('₹') ? '₹' : (yearlyPrice.replace(/[0-9.,]/g, '').trim() || '₹');
      return `${symbol}${perMo}/mo`;
    }
    return '₹83/mo';
  }, [yearlyPrice]);

  useEffect(() => {
    if (isOpen) {
      setPurchaseState('idle');
      if (BillingService.isAvailable()) {
        BillingService.queryProducts().then(products => {
          if (products && products.length > 0) {
            const monthly = products.find(p => p.sku === 'deadlock_pro_monthly' || p.id === 'deadlock_pro_monthly');
            const yearly = products.find(p => p.sku === 'deadlock_pro_yearly' || p.id === 'deadlock_pro_yearly');
            const c50 = products.find(p => p.sku === 'deadlock_scan_credits_50' || p.id === 'deadlock_scan_credits_50');
            const c200 = products.find(p => p.sku === 'deadlock_scan_credits_200' || p.id === 'deadlock_scan_credits_200');
            if (monthly && (monthly.priceString || monthly.price)) setMonthlyPrice(monthly.priceString || monthly.price);
            if (yearly && (yearly.priceString || yearly.price)) setYearlyPrice(yearly.priceString || yearly.price);
            if (c50 && (c50.priceString || c50.price)) setCredits50Price(c50.priceString || c50.price);
            if (c200 && (c200.priceString || c200.price)) setCredits200Price(c200.priceString || c200.price);
          }
        });
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePurchase = async (sku) => {
    if (!navigator.onLine) {
      setPurchaseState('network_error');
      return;
    }
    setPurchaseState('loading');
    
    // Fallback/simulator when native billing is unavailable (e.g. web testing)
    if (!BillingService.isAvailable()) {
      setTimeout(() => {
        if (sku.includes('credits_50')) {
          if (userKeys) addScanCredits(userKeys, 50);
        } else if (sku.includes('credits_200')) {
          if (userKeys) addScanCredits(userKeys, 200);
        } else {
          if (userKeys) localStorage.setItem(userKeys.IS_PRO, 'true');
        }
        setPurchaseState('success');
        setTimeout(() => {
          onPurchaseSuccess({ sku });
        }, 1600);
      }, 900);
      return;
    }

    try {
      const result = await BillingService.purchase(sku);
      if (result && (result.status === 'success' || result.acknowledged)) {
        if (sku.includes('credits_50')) {
          if (userKeys) addScanCredits(userKeys, 50);
        } else if (sku.includes('credits_200')) {
          if (userKeys) addScanCredits(userKeys, 200);
        } else {
          if (userKeys) localStorage.setItem(userKeys.IS_PRO, 'true');
        }
        setPurchaseState('success');
        setTimeout(() => {
          onPurchaseSuccess({ sku });
        }, 1800);
      } else if (result && (result.status === 'cancelled' || result.userCancelled)) {
        // User-cancelled: silent dismiss, no error shown
        setPurchaseState('idle');
      } else if (result && result.status === 'network_error') {
        setPurchaseState('network_error');
      } else {
        setPurchaseState('failed');
      }
    } catch (err) {
      setPurchaseState('failed');
    }
  };

  const handleRestore = async () => {
    if (!navigator.onLine) {
      setPurchaseState('network_error');
      return;
    }
    setPurchaseState('loading');
    try {
      const result = await BillingService.restorePurchases();
      if (result && (result.restored || result.active)) {
        if (userKeys) localStorage.setItem(userKeys.IS_PRO, 'true');
        setPurchaseState('success');
        setTimeout(() => {
          onPurchaseSuccess({ restored: true });
        }, 1800);
      } else {
        setPurchaseState('failed');
      }
    } catch (err) {
      setPurchaseState('failed');
    }
  };

  const onSubscribe = () => {
    const sku = selectedPlan === 'yearly' ? 'deadlock_pro_yearly' : 'deadlock_pro_monthly';
    handlePurchase(sku);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl screen-spring-enter flex flex-col p-6 overflow-y-auto">
      <button 
        onClick={onClose} 
        aria-label="Close paywall"
        className="absolute top-6 right-6 text-zinc-400 hover:text-white p-2 tap-spring"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full pt-8 pb-10">
        <div className="text-center mb-7">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[#3478F7]/25 to-[#EC562E]/20 border border-[#3478F7]/40 rounded-3xl flex items-center justify-center mb-3.5 text-[#3478F7] shadow-xl shadow-[#3478F7]/20">
            <Icons.Crown className="w-8 h-8 text-[#3478F7]" />
          </div>
          <h1 className="text-3xl font-display text-white tracking-tight">DEAD // LOCK PRO</h1>
          <p className="text-xs text-zinc-400 mt-1 uppercase tracking-widest font-semibold">
            Elite Training &amp; Nutrition Engine
          </p>
        </div>

        {/* Headline Benefits List */}
        <div className="bg-[#101014] border border-zinc-800/80 rounded-3xl p-5 mb-6 space-y-4 shadow-2xl">
          <div className="flex items-center space-x-3.5">
            <div className="w-8 h-8 rounded-xl bg-[#EC562E]/15 border border-[#EC562E]/30 flex items-center justify-center text-[#EC562E] shrink-0">
              <Icons.Video className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Full HD Video Workouts &amp; Demos</div>
              <div className="text-[11px] text-zinc-500">Exercise video walkthroughs, technique guides &amp; visual cues</div>
            </div>
          </div>

          <div className="flex items-center space-x-3.5">
            <div className="w-8 h-8 rounded-xl bg-[#3478F7]/15 border border-[#3478F7]/30 flex items-center justify-center text-[#3478F7] shrink-0">
              <Icons.Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Unlimited camera form-check</div>
              <div className="text-[11px] text-zinc-500">Computer vision rep counter &amp; posture checks</div>
            </div>
          </div>

          <div className="flex items-center space-x-3.5">
            <div className="w-8 h-8 rounded-xl bg-[#EC562E]/15 border border-[#EC562E]/30 flex items-center justify-center text-[#EC562E] shrink-0">
              <Icons.Search className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Unlimited AI food scanning</div>
              <div className="text-[11px] text-zinc-500">Instant plate photo scans &amp; smart typed lookups</div>
            </div>
          </div>

          <div className="flex items-center space-x-3.5">
            <div className="w-8 h-8 rounded-xl bg-[#F3D2C6]/15 border border-[#F3D2C6]/30 flex items-center justify-center text-[#F3D2C6] shrink-0">
              <Icons.Diet className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Detailed custom diet plans</div>
              <div className="text-[11px] text-zinc-500">7-day rotating macro meal plans &amp; shopping lists</div>
            </div>
          </div>

          <div className="flex items-center space-x-3.5">
            <div className="w-8 h-8 rounded-xl bg-[#3478F7]/15 border border-[#3478F7]/30 flex items-center justify-center text-[#3478F7] shrink-0">
              <Icons.Dashboard className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Full workout &amp; nutrition history</div>
              <div className="text-[11px] text-zinc-500">Continuous progressive overload tracking</div>
            </div>
          </div>
        </div>

        {/* Subscription Plan Cards */}
        <div className="grid grid-cols-2 gap-3.5 mb-5">
          <div
            onClick={() => setSelectedPlan('monthly')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all tap-spring flex flex-col justify-between ${
              selectedPlan === 'monthly'
                ? 'border-[#3478F7] bg-[#3478F7]/10 shadow-lg shadow-[#3478F7]/10'
                : 'border-zinc-800 bg-[#16161A] hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Monthly</div>
              <div className="text-xl font-black text-white mt-1">{monthlyPrice}</div>
            </div>
            <div className="text-[11px] text-zinc-500 mt-2">Billed monthly</div>
          </div>
          
          <div
            onClick={() => setSelectedPlan('yearly')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all relative tap-spring flex flex-col justify-between ${
              selectedPlan === 'yearly'
                ? 'border-[#EC562E] bg-[#EC562E]/10 shadow-lg shadow-[#EC562E]/15'
                : 'border-zinc-800 bg-[#16161A] hover:border-zinc-700'
            }`}
          >
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-[#EC562E] text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-md">
              BEST VALUE
            </div>
            <div>
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Yearly</div>
              <div className="text-xl font-black text-white mt-1">{yearlyPrice}</div>
            </div>
            <div className="text-[11px] font-bold text-[#EC562E] mt-2">
              {yearlyPerMonth}
            </div>
          </div>
        </div>

        {/* Main Purchase CTA */}
        <button
          onClick={onSubscribe}
          disabled={purchaseState === 'loading' || purchaseState === 'success'}
          className="w-full bg-[#3478F7] hover:bg-blue-600 active:scale-[0.98] text-white font-black py-4 rounded-2xl tap-spring relative overflow-hidden shadow-xl shadow-[#3478F7]/25 text-sm uppercase tracking-wider"
        >
          {purchaseState === 'loading' ? (
            <span className="flex items-center justify-center space-x-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Connecting to Store...</span>
            </span>
          ) : purchaseState === 'success' ? (
            <span className="flex items-center justify-center space-x-2 check-spring text-emerald-400">
              <Icons.Check className="w-5 h-5" />
              <span>Welcome to Dead Lock Pro!</span>
            </span>
          ) : (
            <span>Subscribe {selectedPlan === 'yearly' ? 'Yearly (Best Value)' : 'Monthly'}</span>
          )}
        </button>

        {purchaseState === 'failed' && (
          <div className="text-rose-400 text-xs text-center font-bold mt-2.5 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
            Purchase declined or could not be completed. Please try again.
          </div>
        )}
        {purchaseState === 'network_error' && (
          <div className="text-rose-400 text-xs text-center font-bold mt-2.5 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
            Network unavailable. Check your internet connection and retry.
          </div>
        )}

        {/* Consumable Scan Credits Option for Non-Subscribers */}
        {!isPro && (
          <div className="mt-6 pt-5 border-t border-zinc-800/80">
            <div className="text-center mb-3">
              <span className="text-xs font-bold text-zinc-400">Not ready to subscribe?</span>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Buy consumable scan credits for occasional AI food lookups.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => handlePurchase('deadlock_scan_credits_50')}
                disabled={purchaseState === 'loading'}
                className="bg-[#101014] hover:bg-[#16161A] border border-zinc-800 hover:border-zinc-700 text-white p-3 rounded-xl text-left tap-spring"
              >
                <div className="text-xs font-black text-white">50 Credits</div>
                <div className="text-[11px] font-bold text-[#3478F7] mt-0.5">{credits50Price}</div>
              </button>
              <button 
                onClick={() => handlePurchase('deadlock_scan_credits_200')}
                disabled={purchaseState === 'loading'}
                className="bg-[#101014] hover:bg-[#16161A] border border-zinc-800 hover:border-zinc-700 text-white p-3 rounded-xl text-left tap-spring"
              >
                <div className="text-xs font-black text-white">200 Credits</div>
                <div className="text-[11px] font-bold text-[#EC562E] mt-0.5">{credits200Price} (Value)</div>
              </button>
            </div>
          </div>
        )}

        {/* Mandatory Restore Purchases Link */}
        <div className="mt-6 text-center">
          <button 
            onClick={handleRestore} 
            disabled={purchaseState === 'loading'}
            className="text-xs font-bold text-zinc-500 hover:text-zinc-300 underline tap-spring"
          >
            Restore Purchases
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// DIET LOCKED PREVIEW
// ==========================================
function DietLockedPreview({ onOpenPaywall }) {
  return (
    <div className="pb-28 max-w-md mx-auto px-5 pt-4 relative">
      <div className="mb-6">
        <h1 className="text-3xl font-display text-white uppercase tracking-tight">Diet Planner</h1>
        <p className="text-sm text-[#EC562E] font-medium tracking-wide uppercase mt-1">Pro Feature</p>
      </div>
      
      <div className="filter blur-[6px] opacity-40 pointer-events-none space-y-6">
        <div className="flex space-x-2 overflow-hidden">
          <div className="w-12 h-16 bg-[#3478F7] rounded-full"></div>
          <div className="w-12 h-16 bg-zinc-900 rounded-full"></div>
          <div className="w-12 h-16 bg-zinc-900 rounded-full"></div>
          <div className="w-12 h-16 bg-zinc-900 rounded-full"></div>
          <div className="w-12 h-16 bg-zinc-900 rounded-full"></div>
        </div>
        
        <div className="bg-[#16161A] border border-zinc-800 p-4 rounded-2xl">
          <div className="text-xs font-black uppercase text-zinc-500 mb-3">Breakfast</div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className="text-white">Oats & Protein</div>
              <div className="text-zinc-500 text-sm">450 cal</div>
            </div>
            <div className="flex justify-between">
              <div className="text-white">Black Coffee</div>
              <div className="text-zinc-500 text-sm">5 cal</div>
            </div>
          </div>
        </div>

        <div className="bg-[#16161A] border border-zinc-800 p-4 rounded-2xl">
          <div className="text-xs font-black uppercase text-zinc-500 mb-3">Lunch</div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className="text-white">Chicken Breast</div>
              <div className="text-zinc-500 text-sm">300 cal</div>
            </div>
            <div className="flex justify-between">
              <div className="text-white">Brown Rice</div>
              <div className="text-zinc-500 text-sm">210 cal</div>
            </div>
          </div>
        </div>

        <div className="bg-[#16161A] border border-zinc-800 p-4 rounded-2xl">
          <div className="text-xs font-black uppercase text-zinc-500 mb-3">Dinner</div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className="text-white">Salmon Filet</div>
              <div className="text-zinc-500 text-sm">400 cal</div>
            </div>
            <div className="flex justify-between">
              <div className="text-white">Steamed Broccoli</div>
              <div className="text-zinc-500 text-sm">50 cal</div>
            </div>
          </div>
        </div>
        
        <div className="bg-[#16161A] border border-zinc-800 p-4 rounded-2xl">
          <div className="text-xs font-black uppercase text-zinc-500 mb-3">Shopping List</div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className="text-white">Chicken Breast</div>
              <div className="text-zinc-500 text-sm">1.5 kg</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center z-10 px-6 mt-16">
        <div className="bg-[#1D1D22] border border-zinc-800 p-6 rounded-2xl w-full text-center shadow-2xl">
          <div className="w-12 h-12 mx-auto bg-[#3478F7]/20 rounded-xl flex items-center justify-center text-[#3478F7] mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Unlock with Dead Lock Pro</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Get personalized 7-day diet plans, HD video workouts, shopping lists, and meal macro targets
          </p>
          <button 
            onClick={onOpenPaywall}
            className="w-full bg-[#3478F7] text-white font-bold py-3 rounded-xl tap-spring"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// DIET PLAN TAB
// ==========================================
function DietPlanTab({ profile, foodLogs, onSaveFood, userKeys }) {
  const [dietPrefs, setDietPrefs] = useState(null);
  const [dietPlan, setDietPlan] = useState(null);
  const [selectedDay, setSelectedDay] = useState(0); // 0=Mon, 6=Sun
  const [showSetup, setShowSetup] = useState(false);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Setup form state
  const [formDietType, setFormDietType] = useState('vegetarian');
  const [formCuisine, setFormCuisine] = useState('mixed');
  const [formMealsPerDay, setFormMealsPerDay] = useState(4);
  const [formAvoidList, setFormAvoidList] = useState('');

  useEffect(() => {
    try {
      const prefs = localStorage.getItem(userKeys.DIET_PREFERENCES);
      if (prefs) {
        const parsedPrefs = JSON.parse(prefs);
        setDietPrefs(parsedPrefs);
        setFormDietType(parsedPrefs.dietType || 'vegetarian');
        setFormCuisine(parsedPrefs.cuisine || 'mixed');
        setFormMealsPerDay(parsedPrefs.mealsPerDay || 4);
        setFormAvoidList(parsedPrefs.avoidList || '');
      } else {
        setShowSetup(true);
      }
      
      const plan = localStorage.getItem(userKeys.DIET_PLAN);
      if (plan) {
        setDietPlan(JSON.parse(plan));
      } else {
        setShowSetup(true);
      }
    } catch (e) {
      setShowSetup(true);
    }
  }, [userKeys]);

  const generateDietPlan = (prefs) => {
    const macros = calculateMacros(profile);
    const { dietType, mealsPerDay, avoidList } = prefs;
    const avoids = avoidList.toLowerCase().split(',').map(s => s.trim()).filter(s => s);
    
    // Filter DB
    let availableFoods = NUTRITION_DATABASE.filter(f => {
      if (avoids.some(a => f.name.toLowerCase().includes(a))) return false;
      if (dietType === 'vegetarian') return f.dietType === 'veg' || f.dietType === 'vegan';
      if (dietType === 'eggetarian') return f.dietType === 'veg' || f.dietType === 'vegan' || f.dietType === 'egg';
      if (dietType === 'vegan') return f.dietType === 'vegan';
      return true; // non-veg
    });

    const days = [];
    const mealFractions = mealsPerDay === 3 ? [0.3, 0.4, 0.3] : 
                          mealsPerDay === 4 ? [0.25, 0.3, 0.15, 0.3] : 
                          mealsPerDay === 5 ? [0.2, 0.25, 0.15, 0.25, 0.15] :
                          [0.2, 0.2, 0.15, 0.15, 0.2, 0.1];
    
    const mealNames = mealsPerDay === 3 ? ['Breakfast', 'Lunch', 'Dinner'] : 
                      mealsPerDay === 4 ? ['Breakfast', 'Lunch', 'Snack', 'Dinner'] : 
                      mealsPerDay === 5 ? ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Evening Snack'] :
                      ['Pre-Workout', 'Breakfast', 'Lunch', 'Snack', 'Dinner', 'Evening Snack'];

    for (let d = 0; d < 7; d++) {
      let dayMeals = [];
      let currentSeed = Date.now() + d;
      const pseudoRandom = () => {
        currentSeed = (currentSeed * 9301 + 49297) % 233280;
        return currentSeed / 233280;
      };

      for (let m = 0; m < mealsPerDay; m++) {
        let mealItems = [];
        const isSnack = mealNames[m].toLowerCase().includes('snack') || mealNames[m].toLowerCase().includes('pre-workout');
        
        let catsToPick = isSnack ? ['fruit', 'protein', 'dairy'] : ['grain', 'protein', 'vegetable'];
        
        catsToPick.forEach(cat => {
          let catFoods = availableFoods.filter(f => f.category === cat);
          if (catFoods.length > 0) {
            let item = catFoods[Math.floor(pseudoRandom() * catFoods.length)];
            mealItems.push({...item});
          }
        });

        if (!isSnack && mealItems.length > 0) {
            let extraCats = ['fat', 'legume'];
            let exCat = extraCats[Math.floor(pseudoRandom() * extraCats.length)];
            let catFoods = availableFoods.filter(f => f.category === exCat);
            if(catFoods.length > 0){
                mealItems.push({...catFoods[Math.floor(pseudoRandom() * catFoods.length)]});
            }
        }

        let mealTotals = mealItems.reduce((acc, item) => {
            acc.cal += item.cal;
            acc.p += item.p;
            acc.c += item.c;
            acc.f += item.f;
            return acc;
        }, {cal: 0, p: 0, c: 0, f: 0});

        dayMeals.push({
          name: mealNames[m],
          items: mealItems,
          totals: mealTotals
        });
      }
      
      let dayTotals = dayMeals.reduce((acc, meal) => {
        acc.cal += meal.totals.cal;
        acc.p += meal.totals.p;
        acc.c += meal.totals.c;
        acc.f += meal.totals.f;
        return acc;
      }, {cal: 0, p: 0, c: 0, f: 0});

      days.push({ meals: dayMeals, totals: dayTotals });
    }
    
    return { days, generatedAt: Date.now() };
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const prefs = {
        dietType: formDietType,
        cuisine: formCuisine,
        mealsPerDay: formMealsPerDay,
        avoidList: formAvoidList
      };
      setDietPrefs(prefs);
      localStorage.setItem(userKeys.DIET_PREFERENCES, JSON.stringify(prefs));
      
      const plan = generateDietPlan(prefs);
      setDietPlan(plan);
      localStorage.setItem(userKeys.DIET_PLAN, JSON.stringify(plan));
      
      setShowSetup(false);
      setIsGenerating(false);
    }, 800);
  };

  const regenerateDay = (dayIndex) => {
    if(!dietPlan) return;
    setIsGenerating(true);
    setTimeout(() => {
      const oneDayPlan = generateDietPlan(dietPrefs).days[0];
      const newPlan = {...dietPlan};
      newPlan.days[dayIndex] = oneDayPlan;
      setDietPlan(newPlan);
      localStorage.setItem(userKeys.DIET_PLAN, JSON.stringify(newPlan));
      setIsGenerating(false);
    }, 500);
  };

  const swapItem = (dayIdx, mealIdx, itemIdx) => {
    if(!dietPlan || !dietPrefs) return;
    const newPlan = {...dietPlan};
    const meal = newPlan.days[dayIdx].meals[mealIdx];
    const itemToSwap = meal.items[itemIdx];
    
    const { dietType, avoidList } = dietPrefs;
    const avoids = avoidList.toLowerCase().split(',').map(s => s.trim()).filter(s => s);
    
    const availableFoods = NUTRITION_DATABASE.filter(f => {
      if (f.category !== itemToSwap.category) return false;
      if (f.name === itemToSwap.name) return false;
      if (avoids.some(a => f.name.toLowerCase().includes(a))) return false;
      if (dietType === 'vegetarian') return f.dietType === 'veg' || f.dietType === 'vegan';
      if (dietType === 'eggetarian') return f.dietType === 'veg' || f.dietType === 'vegan' || f.dietType === 'egg';
      if (dietType === 'vegan') return f.dietType === 'vegan';
      return true;
    });

    if(availableFoods.length > 0) {
      const newItem = availableFoods[Math.floor(Math.random() * availableFoods.length)];
      meal.items[itemIdx] = {...newItem};
      
      meal.totals = meal.items.reduce((acc, item) => {
          acc.cal += item.cal;
          acc.p += item.p;
          acc.c += item.c;
          acc.f += item.f;
          return acc;
      }, {cal: 0, p: 0, c: 0, f: 0});
      
      newPlan.days[dayIdx].totals = newPlan.days[dayIdx].meals.reduce((acc, m) => {
        acc.cal += m.totals.cal;
        acc.p += m.totals.p;
        acc.c += m.totals.c;
        acc.f += m.totals.f;
        return acc;
      }, {cal: 0, p: 0, c: 0, f: 0});

      setDietPlan(newPlan);
      localStorage.setItem(userKeys.DIET_PLAN, JSON.stringify(newPlan));
    }
  };

  const logMeal = (meal) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    meal.items.forEach((item, i) => {
      onSaveFood({
        id: 'food_' + Date.now() + '_' + i,
        date: todayStr,
        timestamp: Date.now(),
        name: item.name,
        calories: item.cal,
        protein: item.p,
        carbs: item.c,
        fat: item.f,
        confidence: 'high',
        source: 'plan'
      });
    });
  };

  const copyShoppingList = (text) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {});
    }
  };
  
  const shareShoppingList = (text) => {
    if (navigator.share) {
      navigator.share({ title: 'Dead Lock Shopping List', text }).catch(() => {});
    }
  };

  if (showSetup) {
    return (
      <div className="pb-28 max-w-md mx-auto px-5 pt-4">
        <h1 className="text-3xl font-display text-white uppercase tracking-tight mb-6">Diet Plan Setup</h1>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-zinc-400 uppercase mb-3">Dietary Preference</label>
            <div className="grid grid-cols-2 gap-3">
              {['Vegetarian', 'Eggetarian', 'Non-Vegetarian', 'Vegan'].map(type => {
                const val = type.toLowerCase().replace('-', '');
                const isSel = formDietType === val;
                return (
                  <div 
                    key={val}
                    onClick={() => setFormDietType(val)}
                    className={`p-4 rounded-xl border-2 text-center cursor-pointer tap-spring ${isSel ? 'border-[#3478F7] bg-[#3478F7]/10 text-white' : 'border-zinc-800 bg-[#16161A] text-zinc-400'}`}
                  >
                    <span className="font-bold">{type}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-zinc-400 uppercase mb-3">Cuisine Leaning</label>
            <div className="flex space-x-3">
              {['Indian', 'Western', 'Mixed'].map(type => {
                const val = type.toLowerCase();
                const isSel = formCuisine === val;
                return (
                  <button 
                    key={val}
                    onClick={() => setFormCuisine(val)}
                    className={`flex-1 py-3 rounded-xl border-2 font-bold tap-spring ${isSel ? 'border-[#3478F7] bg-[#3478F7]/10 text-white' : 'border-zinc-800 bg-[#16161A] text-zinc-400'}`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-zinc-400 uppercase mb-3">Meals Per Day</label>
            <div className="flex space-x-3">
              {[3, 4, 5, 6].map(num => (
                <button 
                  key={num}
                  onClick={() => setFormMealsPerDay(num)}
                  className={`flex-1 py-3 rounded-xl border-2 font-bold tap-spring ${formMealsPerDay === num ? 'border-[#3478F7] bg-[#3478F7]/10 text-white' : 'border-zinc-800 bg-[#16161A] text-zinc-400'}`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-zinc-400 uppercase mb-3">Avoid List (Optional)</label>
            <textarea 
              value={formAvoidList}
              onChange={(e) => setFormAvoidList(e.target.value)}
              placeholder="e.g. mushrooms, seafood, soy"
              className="w-full bg-[#16161A] border-2 border-zinc-800 rounded-xl p-4 text-white focus:outline-none focus:border-zinc-600 h-24 resize-none"
            />
          </div>

          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-[#3478F7] text-white font-bold py-4 rounded-xl tap-spring mt-4"
          >
            {isGenerating ? 'Generating...' : 'Generate My 7-Day Plan'}
          </button>
        </div>
      </div>
    );
  }

  if (!dietPlan) return null;

  const targets = calculateMacros(profile);
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  if (showShoppingList) {
    const list = {};
    dietPlan.days.forEach(day => {
      day.meals.forEach(meal => {
        meal.items.forEach(item => {
          let cat = item.category || 'misc';
          if (cat === 'grain' || cat === 'carb') cat = 'Grains & Carbs';
          else if (cat === 'protein') cat = 'Proteins';
          else if (cat === 'vegetable' || cat === 'fruit') cat = 'Vegetables & Fruits';
          else if (cat === 'dairy') cat = 'Dairy';
          else if (cat === 'fat') cat = 'Fats & Oils';
          else if (cat === 'legume') cat = 'Legumes & Pulses';
          
          if (!list[cat]) list[cat] = {};
          if (!list[cat][item.name]) list[cat][item.name] = { count: 0, unit: item.unit };
          list[cat][item.name].count += 1;
        });
      });
    });

    let shareText = "My Dead Lock Shopping List:\n\n";
    Object.keys(list).sort().forEach(cat => {
      shareText += `${cat.toUpperCase()}:\n`;
      Object.keys(list[cat]).forEach(itemName => {
        shareText += `- ${itemName} (${list[cat][itemName].count}x ${list[cat][itemName].unit})\n`;
      });
      shareText += "\n";
    });

    return (
      <div className="pb-28 max-w-md mx-auto px-5 pt-4">
        <h1 className="text-3xl font-display text-white uppercase tracking-tight mb-4">Diet Planner</h1>
        
        <div className="flex space-x-2 mb-6 bg-[#101014] p-1 rounded-xl">
          <button onClick={() => setShowShoppingList(false)} className="flex-1 py-2 text-sm font-bold text-zinc-400 rounded-lg">Meal Plan</button>
          <button className="flex-1 py-2 text-sm font-bold bg-[#1D1D22] text-white shadow rounded-lg">Shopping List</button>
        </div>

        <div className="flex space-x-3 mb-6">
          <button onClick={() => copyShoppingList(shareText)} className="flex-1 bg-[#16161A] border border-zinc-800 text-white py-3 rounded-xl text-sm font-bold flex justify-center items-center space-x-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> <span>Copy</span>
          </button>
          <button onClick={() => shareShoppingList(shareText)} className="flex-1 bg-[#3478F7] text-white py-3 rounded-xl text-sm font-bold flex justify-center items-center space-x-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg> <span>Share</span>
          </button>
        </div>

        <div className="space-y-6">
          {Object.keys(list).sort().map(cat => (
            <div key={cat}>
              <h3 className="text-[#3478F7] font-bold text-sm uppercase mb-3 tracking-wide">{cat}</h3>
              <div className="bg-[#16161A] border border-zinc-800 rounded-2xl overflow-hidden">
                {Object.keys(list[cat]).map((itemName, idx) => (
                  <div key={itemName} className={`p-4 flex justify-between items-center ${idx !== Object.keys(list[cat]).length - 1 ? 'border-b border-zinc-800/50' : ''}`}>
                    <div className="text-white font-medium">{itemName}</div>
                    <div className="text-zinc-500 text-sm">{list[cat][itemName].count}x {list[cat][itemName].unit}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const currentDayData = dietPlan.days[selectedDay];

  return (
    <div className="pb-28 max-w-md mx-auto px-5 pt-4">
      <h1 className="text-3xl font-display text-white uppercase tracking-tight mb-4">Diet Planner</h1>
      
      <div className="flex space-x-2 mb-6 bg-[#101014] p-1 rounded-xl">
        <button className="flex-1 py-2 text-sm font-bold bg-[#1D1D22] text-white shadow rounded-lg">Meal Plan</button>
        <button onClick={() => setShowShoppingList(true)} className="flex-1 py-2 text-sm font-bold text-zinc-400 rounded-lg">Shopping List</button>
      </div>

      <div className="flex space-x-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {dayLabels.map((day, idx) => (
          <button
            key={day}
            onClick={() => setSelectedDay(idx)}
            className={`flex-none w-14 h-16 rounded-2xl flex flex-col items-center justify-center font-bold tap-spring ${selectedDay === idx ? 'bg-[#3478F7] text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}
          >
            <span className="text-xs uppercase">{day}</span>
          </button>
        ))}
      </div>

      <div className="bg-[#16161A] border border-zinc-800 rounded-2xl p-4 mb-6">
        <div className="flex justify-between items-end mb-4">
          <div>
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Day's Total</div>
            <div className="text-2xl font-black text-white">{Math.round(currentDayData.totals.cal)} <span className="text-base font-medium text-zinc-500">/ {targets.targetCalories} cal</span></div>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="flex justify-between text-xs mb-1"><span className="text-zinc-400">Protein</span><span className="text-white font-bold">{Math.round(currentDayData.totals.p)}g</span></div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-[#3478F7]" style={{width: `${Math.min(100, (currentDayData.totals.p/targets.protein)*100)}%`}}></div></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span className="text-zinc-400">Carbs</span><span className="text-white font-bold">{Math.round(currentDayData.totals.c)}g</span></div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-[#EC562E]" style={{width: `${Math.min(100, (currentDayData.totals.c/targets.carbs)*100)}%`}}></div></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span className="text-zinc-400">Fat</span><span className="text-white font-bold">{Math.round(currentDayData.totals.f)}g</span></div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-[#F3D2C6]" style={{width: `${Math.min(100, (currentDayData.totals.f/targets.fat)*100)}%`}}></div></div>
          </div>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        {currentDayData.meals.map((meal, mIdx) => (
          <div key={mIdx} className="bg-[#101014] border border-zinc-800 rounded-2xl p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="text-xs font-black uppercase text-zinc-500">{meal.name}</div>
              <div className="text-sm font-bold text-white">{Math.round(meal.totals.cal)} cal</div>
            </div>
            
            <div className="space-y-3 mb-4">
              {meal.items.map((item, iIdx) => (
                <div key={iIdx} className="flex justify-between items-center">
                  <div className="flex-1">
                    <div className="text-white font-medium">{item.name}</div>
                    <div className="text-xs text-zinc-500">{item.unit} • {item.cal} cal • {item.p}p • {item.c}c • {item.f}f</div>
                  </div>
                  <button onClick={() => swapItem(selectedDay, mIdx, iIdx)} className="text-xs text-[#3478F7] font-bold p-2 tap-spring">Swap</button>
                </div>
              ))}
            </div>
            
            <button 
              onClick={() => logMeal(meal)}
              className="w-full py-2.5 rounded-lg border border-zinc-700 text-sm font-bold text-white flex items-center justify-center space-x-2 tap-spring"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Log this meal</span>
            </button>
          </div>
        ))}
      </div>

      <button 
        onClick={() => regenerateDay(selectedDay)}
        disabled={isGenerating}
        className="w-full bg-[#16161A] border border-zinc-800 text-white font-bold py-4 rounded-xl tap-spring mb-4 flex items-center justify-center space-x-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> <span>{isGenerating ? 'Regenerating...' : 'Regenerate This Day'}</span>
      </button>

      <div className="text-center">
        <button onClick={() => setShowSetup(true)} className="text-sm text-zinc-500 underline tap-spring">Edit Preferences</button>
      </div>
    </div>
  );
}

// ==========================================
// 17. FROSTED BLUR BOTTOM NAVIGATION DOCK
// ==========================================
function BottomNavDock({ currentTab, onTabChange }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
    { id: 'workout', label: 'Workout', icon: Icons.Workout },
    { id: 'diet', label: 'Diet', icon: Icons.Diet },
    { id: 'food', label: 'Food', icon: Icons.Food },
    { id: 'profile', label: 'Profile', icon: Icons.Profile }
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-center p-3 pointer-events-none"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="w-full max-w-sm bg-[#101014]/85 backdrop-blur-2xl border border-zinc-800/80 rounded-3xl px-4 py-2.5 flex items-center justify-around shadow-2xl pointer-events-auto">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const IconComp = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center py-1 px-3 rounded-2xl transition-all tap-spring ${
                isActive ? 'text-[#3478F7]' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <IconComp className="w-5 h-5" active={isActive} />
              <span className={`text-[10px] font-bold mt-1 ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// 17.5 GOOGLE AUTH SCREEN
// Official Google sign-in with athletic Dead Lock branding
// ==========================================
function GoogleAuthScreen({ onSignIn, onContinueGuest }) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Bind auth state observer directly to Google Sign-In instance
  useEffect(() => {
    const auth = getFirebaseAuthInstance();
    if (auth && typeof auth.onAuthStateChanged === 'function') {
      const unsub = auth.onAuthStateChanged((firebaseUser) => {
        if (firebaseUser) {
          onSignIn({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || 'Dead Lock Athlete',
            email: firebaseUser.email || '',
            photoURL: firebaseUser.photoURL || '',
            platform: getRuntimePlatform(),
            lastLogin: Date.now()
          });
        }
      });
      return () => unsub();
    }
  }, [onSignIn]);

  const handleGoogleClick = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await signInWithGoogleCrossPlatform();
      if (res.pendingRedirect) {
        return;
      }
      if (res.user) {
        onSignIn(res.user);
      }
    } catch (err) {
      
      let msg = 'Google Sign-In was not completed. You can try again or tap Continue as Guest.';
      if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in window was closed before completing. Tap below to try again, or continue as guest.';
      } else if (err.code === 'auth/popup-blocked') {
        msg = 'Sign-in popup was blocked by your browser or WebView. Please enable popups or tap Continue as Guest.';
      } else if (err.code === 'auth/cancelled-popup-request') {
        msg = 'A previous sign-in attempt was interrupted. Please tap below to try again.';
      } else if (err.code === 'auth/network-request-failed' || !navigator.onLine) {
        msg = 'No internet connection detected. Check your Wi-Fi/data connection or continue in offline guest mode.';
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        msg = 'An account already exists under this email with another sign-in method.';
      } else if (err.code === 'auth/unauthorized-domain') {
        msg = 'This app domain is not yet authorized in Firebase Console. You can tap Continue as Guest.';
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#000000] flex flex-col justify-between p-6 sm:p-8 text-center select-none overflow-y-auto no-scrollbar screen-spring-enter">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#3478F7]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-72 h-72 bg-[#EC562E]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header & Branding */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 py-6">
        {/* Athletic Lock Emblem */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#16161A] to-[#101014] border border-zinc-800 flex items-center justify-center shadow-2xl shadow-[#3478F7]/20">
            <svg className="w-10 h-10 text-[#3478F7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="3" ry="3" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <circle cx="12" cy="16" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#EC562E] flex items-center justify-center text-[10px] font-black text-white shadow-md">
            DL
          </div>
        </div>

        <h1 className="text-5xl sm:text-6xl font-black text-white tracking-tighter leading-none font-['Archivo_Black',sans-serif]">
          DEAD // LOCK
        </h1>

        <p className="text-[11px] font-black tracking-[0.25em] text-[#3478F7] uppercase mt-2.5">
          ELITE TRAINING & NUTRITION ENGINE
        </p>

        {/* Feature Highlights Pill Grid */}
        <div className="grid grid-cols-2 gap-2.5 max-w-xs w-full mt-8 text-left">
          <div className="bg-[#101014] border border-zinc-800/90 rounded-2xl p-3">
            <div className="text-[10px] font-black text-[#3478F7] uppercase">Macro Engine</div>
            <div className="text-xs font-bold text-zinc-300 mt-0.5">Mifflin-St Jeor Cut & Bulk</div>
          </div>
          <div className="bg-[#101014] border border-zinc-800/90 rounded-2xl p-3">
            <div className="text-[10px] font-black text-[#EC562E] uppercase">6-Day Split</div>
            <div className="text-xs font-bold text-zinc-300 mt-0.5">Equipment-Aware Customizer</div>
          </div>
          <div className="bg-[#101014] border border-zinc-800/90 rounded-2xl p-3">
            <div className="text-[10px] font-black text-[#F3D2C6] uppercase">Vision AI</div>
            <div className="text-xs font-bold text-zinc-300 mt-0.5">Camera Form & Rep Counter</div>
          </div>
          <div className="bg-[#101014] border border-zinc-800/90 rounded-2xl p-3">
            <div className="text-[10px] font-black text-emerald-400 uppercase">Food Engine</div>
            <div className="text-xs font-bold text-zinc-300 mt-0.5">Instant Auto-Macros & Scan</div>
          </div>
        </div>
      </div>

      {/* Action Buttons & Guest Fallback */}
      <div className="w-full max-w-sm mx-auto space-y-3 relative z-10 pt-2 pb-4">
        {errorMsg && (
          <div className="bg-rose-500/15 border border-rose-500/30 rounded-2xl p-3 text-xs text-rose-300 text-left screen-spring-enter leading-relaxed">
            <div className="font-bold text-rose-400 flex items-center space-x-1 mb-0.5">
              <span>⚠️ Notice</span>
            </div>
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleClick}
          disabled={loading}
          className="w-full py-4 px-5 rounded-2xl bg-white hover:bg-zinc-100 active:scale-[0.98] transition-all text-zinc-900 font-extrabold text-sm flex items-center justify-center space-x-3 shadow-2xl shadow-white/10 tap-spring disabled:opacity-60"
        >
          <Icons.Google className="w-5 h-5 flex-shrink-0" />
          <span>{loading ? 'Connecting to Google...' : 'Sign in with Google'}</span>
        </button>

        <button
          type="button"
          onClick={onContinueGuest}
          className="w-full py-3.5 px-5 rounded-2xl bg-[#101014] hover:bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white transition-all tap-spring flex items-center justify-center space-x-2"
        >
          <span>Continue as Guest (Offline Mode)</span>
          <span className="text-[10px] text-zinc-600">→</span>
        </button>

        <p className="text-[11px] text-zinc-600 pt-1">
          🔒 Offline-first. Your workouts and logged meals are stored locally on your device.
        </p>
      </div>
    </div>
  );
}

// ==========================================
// 17.8 SHARED MODALS & TELEMETRY
// ==========================================
function ConfirmModal({ isOpen, title, message, secondaryLabel, onSecondary, confirmLabel = 'Confirm', cancelLabel = 'Cancel', isDanger = false, onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 screen-spring-enter">
      <div className="bg-[#101014] border border-zinc-800 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
        <h3 className="text-lg font-black text-white font-['Archivo_Black',sans-serif]">{title}</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">{message}</p>
        <div className="pt-2 space-y-2">
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="w-full py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-200 hover:text-white tap-spring"
            >
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`w-full py-3 rounded-2xl text-xs font-bold text-white tap-spring ${
              isDanger ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/30' : 'bg-[#3478F7] hover:bg-blue-600 shadow-lg shadow-[#3478F7]/30'
            }`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2.5 text-xs font-bold text-zinc-500 hover:text-zinc-300 tap-spring"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThankYouModal({ title, subtitle, details, ctaText = 'Continue', onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 screen-spring-enter">
      <div className="bg-[#101014] border border-zinc-800 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl relative">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto check-spring">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <h3 className="text-xl font-black text-white font-['Archivo_Black',sans-serif]">{title}</h3>
          <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{subtitle}</p>
        </div>
        {details && (
          <div className="bg-zinc-900/80 rounded-2xl p-3 text-left border border-zinc-800 text-xs text-zinc-300">
            {details}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-[#3478F7] hover:bg-blue-600 active:scale-95 text-white font-black text-sm tap-spring shadow-lg shadow-[#3478F7]/30"
        >
          {ctaText}
        </button>
      </div>
    </div>
  );
}

function trackAppEvent(eventName, eventData = {}) {
  try {
    const payload = { event: eventName, data: eventData, ts: Date.now() };
    window.dispatchEvent(new CustomEvent('deadlock:telemetry', { detail: payload }));
  } catch (e) {}
}

// ==========================================
// 18. ROOT APP CONTAINER
// State synchronization & screen routing
// ==========================================
function App() {
  const [authUser, setAuthUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS_GLOBAL.AUTH_USER);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [isGuest, setIsGuest] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS_GLOBAL.AUTH_GUEST) === 'true';
  });

  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Active storage keys derived from active user UID or guest
  const currentUid = authUser?.uid || (isGuest ? 'guest' : null);
  const userKeys = useMemo(() => getStorageKeys(currentUid), [currentUid]);

  // User-scoped data states
  const [profile, setProfile] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [foodLogs, setFoodLogs] = useState([]);
  const [weightLogs, setWeightLogs] = useState([]);
  const [apiKey, setApiKey] = useState('');
  const [hasOnboarded, setHasOnboarded] = useState(false);

  // Modals & Navigation
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [showIntro, setShowIntro] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [shuffleOffsets, setShuffleOffsets] = useState({});

  // Pro entitlement, consumable scan credits & Paywall states
  const [isPro, setIsPro] = useState(() => {
    try {
      return localStorage.getItem(userKeys.IS_PRO) === 'true';
    } catch (e) {
      return false;
    }
  });
  const [scanCredits, setScanCredits] = useState(() => getScanCredits(userKeys));
  const [showPaywall, setShowPaywall] = useState(false);

  // Confirmation modals state
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Thank You / Completion modal
  const [thankYouModal, setThankYouModal] = useState(null);

  // Dynamic Document Title per Screen / Tab
  useEffect(() => {
    const titles = {
      dashboard: 'Dead Lock — Athlete Command Center',
      workout: 'Dead Lock — 6-Day Workout Engine',
      diet: 'Dead Lock — Custom Diet Planner',
      food: 'Dead Lock — Macro & Nutrition Tracker',
      profile: 'Dead Lock — Athlete Profile & Settings'
    };
    document.title = titles[currentTab] || 'Dead Lock — Elite Training & Nutrition';
    trackAppEvent('screen_view', { screen: currentTab });
  }, [currentTab]);

  // Load user-scoped data whenever active identity changes
  useEffect(() => {
    if (!currentUid) {
      setProfile(null);
      setEquipment([]);
      setWorkoutLogs([]);
      setFoodLogs([]);
      setWeightLogs([]);
      setApiKey('');
      setHasOnboarded(false);
      setIsPro(false);
      setScanCredits(0);
      return;
    }

    migrateLegacyStorage(currentUid);
    const keys = getStorageKeys(currentUid);

    try {
      const p = localStorage.getItem(keys.PROFILE);
      setProfile(p ? JSON.parse(p) : null);
    } catch (e) { setProfile(null); }

    try {
      const eq = localStorage.getItem(keys.EQUIPMENT);
      setEquipment(eq ? JSON.parse(eq) : []);
    } catch (e) { setEquipment([]); }

    try {
      const w = localStorage.getItem(keys.WORKOUT_LOG);
      setWorkoutLogs(w ? JSON.parse(w) : []);
    } catch (e) { setWorkoutLogs([]); }

    try {
      const f = localStorage.getItem(keys.FOOD_LOG);
      setFoodLogs(f ? JSON.parse(f) : []);
    } catch (e) { setFoodLogs([]); }

    try {
      const wt = localStorage.getItem(keys.WEIGHT_LOG);
      setWeightLogs(wt ? JSON.parse(wt) : []);
    } catch (e) { setWeightLogs([]); }

    try {
      const k = localStorage.getItem(keys.API_KEY);
      setApiKey(k || '');
    } catch (e) { setApiKey(''); }

    try {
      const cachedPro = localStorage.getItem(keys.IS_PRO) === 'true';
      setIsPro(cachedPro);
      setScanCredits(getScanCredits(keys));
    } catch (e) {}

    // Verify against platform on launch / identity switch, don't trust cache forever
    verifyProEntitlement(keys).then((res) => {
      if (res && typeof res.isPro === 'boolean') {
        setIsPro(res.isPro);
      }
    });

    try {
      const ob = localStorage.getItem(keys.HAS_ONBOARDED) === 'true';
      setHasOnboarded(ob);
      if (!ob) {
        setShowIntro(true);
      } else {
        setShowIntro(false);
      }
    } catch (e) { setHasOnboarded(false); }
  }, [currentUid]);

  // Auth state verification on launch
  useEffect(() => {
    let timer = setTimeout(() => {
      setAuthChecking(false);
    }, 1800);

    handleCheckRedirect().then((usr) => {
      if (usr) {
        setAuthUser(usr);
        setIsGuest(false);
        localStorage.setItem(STORAGE_KEYS_GLOBAL.AUTH_USER, JSON.stringify(usr));
        localStorage.removeItem(STORAGE_KEYS_GLOBAL.AUTH_GUEST);
        setAuthChecking(false);
        clearTimeout(timer);
      }
    });

    const auth = getFirebaseAuthInstance();
    if (auth && typeof auth.onAuthStateChanged === 'function') {
      const unsub = auth.onAuthStateChanged((firebaseUser) => {
        if (firebaseUser) {
          const platform = getRuntimePlatform();
          const authUserData = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || 'Dead Lock Athlete',
            email: firebaseUser.email || '',
            photoURL: firebaseUser.photoURL || '',
            platform,
            lastLogin: Date.now()
          };
          setAuthUser(authUserData);
          setIsGuest(false);
          localStorage.setItem(STORAGE_KEYS_GLOBAL.AUTH_USER, JSON.stringify(authUserData));
          localStorage.removeItem(STORAGE_KEYS_GLOBAL.AUTH_GUEST);
        }
        setAuthChecking(false);
        clearTimeout(timer);
      });
      return () => {
        unsub();
        clearTimeout(timer);
      };
    } else {
      setAuthChecking(false);
      clearTimeout(timer);
    }
  }, []);

  // Android back-button & history navigation support
  useEffect(() => {
    window.history.pushState({ screen: 'app' }, '');
    const handlePopState = () => {
      if (activeSession) {
        window.history.pushState({ screen: 'session' }, '');
      } else if (showEquipmentModal) {
        setShowEquipmentModal(false);
      } else if (currentTab !== 'dashboard') {
        setCurrentTab('dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeSession, showEquipmentModal, currentTab]);

  const handleGoogleSignIn = async () => {
    setIsAuthenticating(true);
    try {
      const res = await signInWithGoogleCrossPlatform();
      if (res.pendingRedirect) {
        return;
      }
      if (res.user) {
        setAuthUser(res.user);
        setIsGuest(false);
        localStorage.setItem(STORAGE_KEYS_GLOBAL.AUTH_USER, JSON.stringify(res.user));
        localStorage.removeItem(STORAGE_KEYS_GLOBAL.AUTH_GUEST);
        const keys = getStorageKeys(res.user.uid);
        const ob = localStorage.getItem(keys.HAS_ONBOARDED) === 'true';
        if (!ob) {
          setShowIntro(true);
        }
      }
    } catch (err) {
      alert('Sign-In notice: ' + (err.message || 'Authentication error'));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleExecuteSignOut = async () => {
    setShowSignOutConfirm(false);
    await signOutFirebase();
    setAuthUser(null);
    setIsGuest(false);
    localStorage.removeItem(STORAGE_KEYS_GLOBAL.AUTH_USER);
    localStorage.removeItem(STORAGE_KEYS_GLOBAL.AUTH_GUEST);
  };

  const handleExecuteResetApp = async () => {
    setShowResetConfirm(false);
    if (currentUid) {
      clearUserStorage(currentUid);
    }
    await clearAllPhotosFromDb();
    await signOutFirebase();
    setAuthUser(null);
    setIsGuest(false);
    setProfile(null);
    setEquipment([]);
    setWorkoutLogs([]);
    setFoodLogs([]);
    setWeightLogs([]);
    setApiKey('');
    setHasOnboarded(false);
    setCurrentTab('dashboard');
    setShowIntro(false);
    setShowOnboarding(false);
    setActiveSession(null);
    setIsPro(false);
    setScanCredits(0);
    setShowPaywall(false);
  };

  const workoutPlan = useMemo(() => {
    return generateWorkoutPlan(equipment, profile, shuffleOffsets);
  }, [equipment, profile, shuffleOffsets]);

  const todayWorkoutDay = useMemo(() => {
    const dayOfWeek = (new Date().getDay() + 6) % 7;
    return workoutPlan[Math.min(dayOfWeek, workoutPlan.length - 1)] || workoutPlan[0];
  }, [workoutPlan]);

  const handleSaveProfile = (newProf) => {
    setProfile(newProf);
    setHasOnboarded(true);
    localStorage.setItem(userKeys.PROFILE, JSON.stringify(newProf));
    localStorage.setItem(userKeys.HAS_ONBOARDED, 'true');
    setShowOnboarding(false);
    if (!localStorage.getItem(userKeys.EQUIPMENT)) {
      setShowEquipmentModal(true);
    }
    setThankYouModal({
      title: 'Athlete Dossier Initialized! 🚀',
      subtitle: 'Your biometrics and macro targets have been successfully saved.',
      details: (
        <div className="space-y-1">
          <p><strong className="text-white">Goal:</strong> {newProf.goal || 'Hypertrophy'}</p>
          <p><strong className="text-white">Biometrics:</strong> {newProf.age} yrs &bull; {newProf.weightKg} kg &bull; {newProf.heightCm} cm</p>
          <p className="text-emerald-400 font-bold mt-1">6-Day Custom Split generated based on your gear.</p>
        </div>
      ),
      ctaText: 'Enter Dashboard'
    });
    trackAppEvent('onboarding_completed', { goal: newProf.goal });
  };

  const handleSaveEquipment = (newEq) => {
    setEquipment(newEq);
    localStorage.setItem(userKeys.EQUIPMENT, JSON.stringify(newEq));
    setShowEquipmentModal(false);
  };

  const handleSaveWorkout = (sessionData) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const newEntry = {
      id: 'workout_' + Date.now(),
      date: todayStr,
      timestamp: Date.now(),
      ...sessionData
    };
    const updated = [newEntry, ...workoutLogs];
    setWorkoutLogs(updated);
    localStorage.setItem(userKeys.WORKOUT_LOG, JSON.stringify(updated));
    setActiveSession(null);
    setThankYouModal({
      title: 'Workout Locked In! ⚡',
      subtitle: `Incredible work today. Your session "${sessionData.dayTitle || 'Workout'}" has been permanently recorded in your dossier.`,
      details: (
        <div className="space-y-1">
          <p><strong className="text-white">Completed Sets:</strong> {sessionData.completedSets?.length || 0}</p>
          <p className="text-emerald-400 font-bold">Recovery protocol initialized.</p>
        </div>
      ),
      ctaText: 'View Dashboard'
    });
    trackAppEvent('workout_completed', { workoutId: sessionData.dayId });
  };

  const handleSaveFood = (item) => {
    const updated = [item, ...foodLogs];
    setFoodLogs(updated);
    localStorage.setItem(userKeys.FOOD_LOG, JSON.stringify(updated));
    trackAppEvent('food_logged', { name: item.name });
  };

  const handleDeleteFood = (id) => {
    const updated = foodLogs.filter((f) => f.id !== id);
    setFoodLogs(updated);
    localStorage.setItem(userKeys.FOOD_LOG, JSON.stringify(updated));
  };

  const handleLogWeight = (date, weightKg) => {
    const filtered = weightLogs.filter((w) => w.date !== date);
    const updated = [...filtered, { date, weightKg }].sort((a, b) => new Date(a.date) - new Date(b.date));
    setWeightLogs(updated);
    localStorage.setItem(userKeys.WEIGHT_LOG, JSON.stringify(updated));
    trackAppEvent('weight_logged', { weightKg });
  };

  const handleSaveApiKey = (key) => {
    setApiKey(key);
    localStorage.setItem(userKeys.API_KEY, key);
  };

  const handleRegenerateDay = (dayId) => {
    setShuffleOffsets((prev) => ({
      ...prev,
      [dayId]: (prev[dayId] || 0) + 1
    }));
  };

  const handleExportData = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      athlete: authUser ? { displayName: authUser.displayName, email: authUser.email } : 'Guest',
      profile,
      equipment,
      workoutLogs,
      foodLogs,
      weightLogs
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deadlock_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    trackAppEvent('data_exported');
  };

  // Schema-validated and sanitized backup import
  const handleImportData = (jsonStr) => {
    try {
      if (typeof jsonStr !== 'string' || jsonStr.length > 5 * 1024 * 1024) {
        throw new Error('File exceeds safe import size.');
      }
      const data = JSON.parse(jsonStr);
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid JSON structure.');
      }
      if (data.profile && typeof data.profile === 'object') {
        const sanitizedProfile = {
          sex: String(data.profile.sex || 'Male').slice(0, 20),
          age: Math.max(10, Math.min(120, Number(data.profile.age) || 25)),
          heightCm: Math.max(80, Math.min(250, Number(data.profile.heightCm) || 175)),
          weightKg: Math.max(30, Math.min(300, Number(data.profile.weightKg) || 75)),
          activityLevel: String(data.profile.activityLevel || 'Moderate').slice(0, 50),
          goal: String(data.profile.goal || 'Hypertrophy').slice(0, 50)
        };
        setProfile(sanitizedProfile);
        localStorage.setItem(userKeys.PROFILE, JSON.stringify(sanitizedProfile));
      }
      if (Array.isArray(data.equipment)) {
        const sanitizedEquipment = data.equipment.map(e => String(e).slice(0, 100));
        setEquipment(sanitizedEquipment);
        localStorage.setItem(userKeys.EQUIPMENT, JSON.stringify(sanitizedEquipment));
      }
      if (Array.isArray(data.workoutLogs)) {
        const sanitizedWorkouts = data.workoutLogs.slice(0, 1000);
        setWorkoutLogs(sanitizedWorkouts);
        localStorage.setItem(userKeys.WORKOUT_LOG, JSON.stringify(sanitizedWorkouts));
      }
      if (Array.isArray(data.foodLogs)) {
        const sanitizedFoods = data.foodLogs.slice(0, 2000);
        setFoodLogs(sanitizedFoods);
        localStorage.setItem(userKeys.FOOD_LOG, JSON.stringify(sanitizedFoods));
      }
      if (Array.isArray(data.weightLogs)) {
        const sanitizedWeights = data.weightLogs.slice(0, 1000);
        setWeightLogs(sanitizedWeights);
        localStorage.setItem(userKeys.WEIGHT_LOG, JSON.stringify(sanitizedWeights));
      }
      setThankYouModal({
        title: 'Data Restored Successfully!',
        subtitle: 'Your workout dossier, food logs, and profile metrics were verified and imported.',
        ctaText: 'Continue'
      });
      trackAppEvent('data_imported');
    } catch (e) {
      alert('Corrupt or incompatible backup JSON: ' + (e.message || 'Invalid format'));
    }
  };

  // 1. Auth-gate loading state
  if (authChecking) {
    return (
      <div className="fixed inset-0 z-50 bg-[#000000] flex flex-col items-center justify-center p-8 text-center select-none safe-inset">
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#16161A] to-[#101014] border border-zinc-800 flex items-center justify-center shadow-2xl shadow-[#3478F7]/20">
            <svg className="w-8 h-8 text-[#3478F7] animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="3" ry="3" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <circle cx="12" cy="16" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#EC562E] flex items-center justify-center text-[9px] font-black text-white">
            DL
          </div>
        </div>
        <div className="w-8 h-8 border-2 border-[#3478F7] border-t-transparent rounded-full animate-spin mb-4" />
        <h1 className="text-xl font-black text-white tracking-tight font-['Archivo_Black',sans-serif]">
          DEAD // LOCK
        </h1>
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
          Authenticating Athlete Session...
        </p>
      </div>
    );
  }

  // 2. Auth-gate: route signed-out users to branded sign-in screen
  if (!authUser && !isGuest) {
    return (
      <GoogleAuthScreen
        onSignIn={(user) => {
          setAuthUser(user);
          setIsGuest(false);
          localStorage.setItem(STORAGE_KEYS_GLOBAL.AUTH_USER, JSON.stringify(user));
          localStorage.removeItem(STORAGE_KEYS_GLOBAL.AUTH_GUEST);
          const keys = getStorageKeys(user.uid);
          if (localStorage.getItem(keys.HAS_ONBOARDED) !== 'true') {
            setShowIntro(true);
          }
        }}
        onContinueGuest={() => {
          setIsGuest(true);
          localStorage.setItem(STORAGE_KEYS_GLOBAL.AUTH_GUEST, 'true');
          const keys = getStorageKeys('guest');
          if (localStorage.getItem(keys.HAS_ONBOARDED) !== 'true') {
            setShowIntro(true);
          }
        }}
      />
    );
  }

  // 3. Branded intro screen for new athlete
  if (showIntro) {
    return (
      <IntroScreen
        onGetStarted={() => {
          setShowIntro(false);
          setShowOnboarding(true);
        }}
        onGoogleSignIn={handleGoogleSignIn}
        isAuthenticating={isAuthenticating}
      />
    );
  }

  // 4. Onboarding flow
  if (showOnboarding || !hasOnboarded || !profile) {
    return (
      <OnboardingFlow
        initialProfile={profile}
        onComplete={handleSaveProfile}
      />
    );
  }

  // 5. Active guided workout session
  if (activeSession) {
    return (
      <GuidedSessionMode
        workoutDay={activeSession}
        profile={profile}
        onSaveWorkout={handleSaveWorkout}
        onExit={() => setActiveSession(null)}
        isPro={isPro}
        userKeys={userKeys}
        onOpenPaywall={() => setShowPaywall(true)}
      />
    );
  }

  // 6. Main Dashboard / Tabs
  return (
    <div className="min-h-full bg-[#000000] text-zinc-100 antialiased selection:bg-[#3478F7]/30">
      {currentTab === 'dashboard' && (
        <DashboardTab
          profile={profile}
          workoutLogs={workoutLogs}
          foodLogs={foodLogs}
          weightLogs={weightLogs}
          todayWorkoutDay={todayWorkoutDay}
          onStartWorkout={(day) => setActiveSession(day)}
          onLogWeight={handleLogWeight}
          onOpenSettings={() => setCurrentTab('profile')}
        />
      )}

      {currentTab === 'workout' && (
        <WorkoutTab
          workoutPlan={workoutPlan}
          completedDates={workoutLogs.map((w) => w.date)}
          equipment={equipment}
          profile={profile}
          onStartSession={(day) => setActiveSession(day)}
          onRegenerateDay={handleRegenerateDay}
          onOpenEquipment={() => setShowEquipmentModal(true)}
        />
      )}

      {currentTab === 'diet' && (
        isPro ? (
          <DietPlanTab
            profile={profile}
            foodLogs={foodLogs}
            onSaveFood={handleSaveFood}
            userKeys={userKeys}
          />
        ) : (
          <DietLockedPreview
            onOpenPaywall={() => setShowPaywall(true)}
          />
        )
      )}

      {currentTab === 'food' && (
        <FoodTab
          foodLogs={foodLogs}
          profile={profile}
          apiKey={apiKey}
          onSaveFood={handleSaveFood}
          onDeleteFood={handleDeleteFood}
          onOpenSettings={() => setCurrentTab('profile')}
          isPro={isPro}
          scanCredits={scanCredits}
          userKeys={userKeys}
          onOpenPaywall={() => setShowPaywall(true)}
          onUseCredit={() => setScanCredits(getScanCredits(userKeys))}
        />
      )}

      {currentTab === 'profile' && (
        <ProfileTab
          profile={profile}
          equipment={equipment}
          apiKey={apiKey}
          authUser={authUser}
          isPro={isPro}
          onOpenPaywall={() => setShowPaywall(true)}
          onGoogleSignIn={handleGoogleSignIn}
          onSignOut={() => setShowSignOutConfirm(true)}
          onTriggerGoogleSignIn={() => {
            setAuthUser(null);
            setIsGuest(false);
          }}
          onEditProfile={() => setShowOnboarding(true)}
          onEditEquipment={() => setShowEquipmentModal(true)}
          onSaveApiKey={handleSaveApiKey}
          onExportData={handleExportData}
          onImportData={handleImportData}
          onRequestResetData={() => setShowResetConfirm(true)}
        />
      )}

      {showEquipmentModal && (
        <EquipmentModal
          currentEquipment={equipment}
          onSave={handleSaveEquipment}
          onClose={() => setShowEquipmentModal(false)}
        />
      )}

      {/* Branded Sign-Out Confirmation Modal with Export prompt */}
      <ConfirmModal
        isOpen={showSignOutConfirm}
        title="Sign Out of Dead Lock?"
        message="Before signing out, you may want to export a backup so your workout and nutrition history can easily be restored."
        secondaryLabel="Export Backup & Sign Out"
        onSecondary={() => {
          handleExportData();
          setTimeout(() => handleExecuteSignOut(), 600);
        }}
        confirmLabel="Sign Out Only"
        cancelLabel="Stay Signed In"
        isDanger={true}
        onConfirm={handleExecuteSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />

      {/* Branded Reset App Confirmation Modal */}
      <ConfirmModal
        isOpen={showResetConfirm}
        title="Reset All Application Data?"
        message="This will completely wipe your profile, gear selections, workout history, food logs, and cached photos on this device for this user. This action cannot be undone."
        confirmLabel="Reset Everything"
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={handleExecuteResetApp}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* Thank You & Completion Modal */}
      {thankYouModal && (
        <ThankYouModal
          title={thankYouModal.title}
          subtitle={thankYouModal.subtitle}
          details={thankYouModal.details}
          ctaText={thankYouModal.ctaText}
          onClose={() => setThankYouModal(null)}
        />
      )}

      {/* Paywall Screen Modal */}
      {showPaywall && (
        <PaywallScreen
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          onPurchaseSuccess={() => {
            verifyProEntitlement(userKeys).then((res) => {
              if (res && typeof res.isPro === 'boolean') setIsPro(res.isPro);
            });
            setScanCredits(getScanCredits(userKeys));
            setShowPaywall(false);
          }}
          isPro={isPro}
          scanCredits={scanCredits}
          userKeys={userKeys}
        />
      )}

      <BottomNavDock
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
      />
    </div>
  );
}

// Crash-safe ErrorBoundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl font-bold">!</div>
          <h2 className="text-lg font-black text-white">Something went wrong</h2>
          <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">{String(this.state.error?.message || this.state.error)}</p>
          <button
            type="button"
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            className="px-5 py-2.5 rounded-xl bg-[#3478F7] text-white text-xs font-bold tap-spring"
          >
            Reset App State
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Mount to DOM with crash-safe ErrorBoundary
const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
