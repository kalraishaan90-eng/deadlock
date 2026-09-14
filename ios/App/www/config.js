// Dead Lock — Cross-Platform Service Configuration
(function() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isAndroid = /Android/.test(navigator.userAgent);
  const platform = isIOS ? 'ios' : (isAndroid ? 'android' : 'web');

  const IOS_CONFIG = {
    apiKey: 'AIzaSyBlOiQsX9ggSB51Dr42h0f_ZtedfNj9PrI',
    authDomain: 'workkoutapp.firebaseapp.com',
    projectId: 'workkoutapp',
    storageBucket: 'workkoutapp.firebasestorage.app',
    messagingSenderId: '646212023629',
    appId: '1:646212023629:ios:8fa53af3c718c432c27304',
    clientId: '646212023629-urciv20i6p3sas908ff5le4bsfcft8hm.apps.googleusercontent.com',
    reversedClientId: 'com.googleusercontent.apps.646212023629-urciv20i6p3sas908ff5le4bsfcft8hm',
    bundleId: 'com.example.workoutapp'
  };

  const GOOGLE_SERVICES_CONFIG = {
    apiKey: 'AIzaSyAVIoo3XSAsxZAjrWzERWU-UZqPSE4iQR0',
    authDomain: 'workkoutapp.firebaseapp.com',
    projectId: 'workkoutapp',
    storageBucket: 'workkoutapp.firebasestorage.app',
    messagingSenderId: '646212023629',
    appId: '1:646212023629:android:c692059775553749c27304'
  };

  const ANDROID_CONFIG = {
    ...GOOGLE_SERVICES_CONFIG,
    packageName: 'com.physique.workoutapp'
  };

  const WEB_CONFIG = {
    ...GOOGLE_SERVICES_CONFIG
  };

  function initFirebase() {
    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
      if (!firebase.apps || !firebase.apps.length) {
        try {
          const activeCfg = isIOS ? (IOS_CONFIG || GOOGLE_SERVICES_CONFIG) : GOOGLE_SERVICES_CONFIG;
          firebase.initializeApp(activeCfg);
        } catch (e) {
          // Firebase init handled silently in production
        }
      }
      if (firebase.auth) {
        const auth = firebase.auth();
        window.firebaseAuth = auth;
        return auth;
      }
    }
    return null;
  }

  initFirebase();

  window.GOOGLE_SERVICES_CONFIG = GOOGLE_SERVICES_CONFIG;
  window.initFirebase = initFirebase;

  window.PHYSIQUE_CONFIG = {
    PLATFORM: platform,
    APP_VERSION: '1.0.0',
    BUILD_NUMBER: '1',

    FIREBASE_CONFIG_IOS: IOS_CONFIG,
    FIREBASE_CONFIG_ANDROID: ANDROID_CONFIG,
    FIREBASE_CONFIG_WEB: WEB_CONFIG,
    GOOGLE_SERVICES_CONFIG: GOOGLE_SERVICES_CONFIG,
    FIREBASE_CONFIG: isIOS ? IOS_CONFIG : GOOGLE_SERVICES_CONFIG,

    initFirebase: initFirebase,

    GOOGLE_OAUTH: {
      IOS: {
        clientId: IOS_CONFIG.clientId,
        reversedClientId: IOS_CONFIG.reversedClientId,
        bundleId: IOS_CONFIG.bundleId
      },
      ANDROID: {
        packageName: ANDROID_CONFIG.packageName
      },
      WEB: {
        authDomain: 'workkoutapp.firebaseapp.com'
      }
    }
  };
})();
