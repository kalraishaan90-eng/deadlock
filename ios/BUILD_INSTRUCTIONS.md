# Dead Lock — iOS Runner & .ipa Package Build Guide

This document explains how to build the iOS package (`.ipa` or simulator runner bundle) for **Dead Lock** using the configured iOS Google OAuth credentials from `GoogleService-Info.plist`.

---

## 1. OAuth & Environment Summary

- **App Name**: Dead Lock
- **Bundle ID**: `com.example.workoutapp`
- **iOS Client ID**: `646212023629-urciv20i6p3sas908ff5le4bsfcft8hm.apps.googleusercontent.com`
- **Reversed Client ID (URL Scheme)**: `com.googleusercontent.apps.646212023629-urciv20i6p3sas908ff5le4bsfcft8hm`
- **Firebase Project ID**: `workkoutapp`
- **Firebase iOS App ID**: `1:646212023629:ios:8fa53af3c718c432c27304`

---

## 2. Asset Preparation (Windows or Mac)

Before running the Xcode build, synchronize the web app bundle into the iOS runner:

```powershell
# In PowerShell (Windows):
powershell -ExecutionPolicy Bypass -File .\scripts\build-ios.ps1
```

Or manually:
```bash
npx esbuild app.jsx --outfile=app.js
mkdir -p ios/App/www
cp index.html config.js app.js manifest.json icon.svg sw.js ios/App/www/
cp -r vendor ios/App/www/
```

---

## 3. Build Option A: Cloud CI/CD (No Mac Required)

Because native iOS compilation requires Apple's macOS SDK and Xcode toolchain, you can generate the `.ipa` package directly from your Windows development environment using GitHub Actions:

1. A workflow is already set up at [`.github/workflows/build-ios.yml`](../.github/workflows/build-ios.yml).
2. Commit and push your changes to your GitHub repository:
   ```bash
   git add .
   git commit -m "Complete iOS Google OAuth setup and runner configuration"
   git push origin main
   ```
3. Navigate to your repository on GitHub -> **Actions** tab.
4. Select **Build iOS Runner Package (.ipa)** and click **Run workflow**.
5. Once the run completes (~3–5 minutes), download `DeadLock-iOS-Package` from the **Artifacts** section at the bottom of the run page. It contains `DeadLock.ipa`.

---

## 4. Build Option B: Local Build with macOS & Xcode

If you or a team member have a Mac:

### Step 1: Install Dependencies
```bash
cd ios
pod install
```

### Step 2: Open in Xcode
```bash
open DeadLock.xcworkspace
# or open DeadLock.xcodeproj
```

- In Xcode, select the **DeadLock** project target.
- Under **Signing & Capabilities**, select your **Team** (Free personal team or Apple Developer Account).
- Ensure the **Bundle Identifier** is set to `com.example.workoutapp`.
- Verify under **Info** -> **URL Types** that the URL Scheme matches `com.googleusercontent.apps.646212023629-urciv20i6p3sas908ff5le4bsfcft8hm`.

### Step 3: Command-Line Build & Archive
To build and export via CLI:
```bash
# Archive the project
xcodebuild -workspace DeadLock.xcworkspace \
  -scheme DeadLock \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/DeadLock.xcarchive \
  archive

# Export to .ipa
xcodebuild -exportArchive \
  -archivePath build/DeadLock.xcarchive \
  -exportOptionsPlist exportOptions.plist \
  -exportPath build/
```
The output `DeadLock.ipa` will be generated in `ios/build/`.

### Step 4: Testing on iOS Simulator
To run directly on an iOS Simulator without signing certificates:
```bash
xcodebuild -workspace DeadLock.xcworkspace \
  -scheme DeadLock \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  build
```

---

## 5. Verification Checklist

1. [x] `GoogleService-Info.plist` placed in `ios/` with extracted `REVERSED_CLIENT_ID`.
2. [x] `config.js` configured with `FIREBASE_CONFIG_IOS` and `GOOGLE_OAUTH.IOS`.
3. [x] `server.js` validates Google OAuth ID tokens and accepts iOS Client ID `646212023629-urciv20i6p3sas908ff5le4bsfcft8hm.apps.googleusercontent.com`.
4. [x] Frontend `app.jsx` dynamically detects platform, uses appropriate OAuth parameters, and handles popup + redirect fallback on iOS.
5. [x] `ios/Info.plist` registers `CFBundleURLSchemes` with `REVERSED_CLIENT_ID`.
6. [x] Build workflow and packaging scripts created.
