# Dead Lock - iOS Build & Asset Preparation Script (PowerShell)
# Prepares web bundle, copies www assets to iOS bundle directory, and validates configuration.

param(
    [string]$Config = "Release"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Dead Lock - iOS Build & Packaging Pipeline" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Transpile Frontend Bundle
Write-Host "[1/4] Transpiling frontend with esbuild..." -ForegroundColor Yellow
npx esbuild app.jsx --outfile=app.js
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build app.js!"
    exit 1
}
Write-Host "  -> app.js successfully generated." -ForegroundColor Green

# 2. Prepare iOS Web Assets Directory (ios/App/www)
Write-Host "[2/4] Syncing web assets to ios/App/www bundle..." -ForegroundColor Yellow
$IosWww = Join-Path $ProjectRoot "ios\App\www"
if (-not (Test-Path $IosWww)) {
    New-Item -ItemType Directory -Path $IosWww -Force | Out-Null
}

$FilesToCopy = @("index.html", "config.js", "app.js", "manifest.json", "icon.svg", "sw.js")
foreach ($f in $FilesToCopy) {
    Copy-Item (Join-Path $ProjectRoot $f) (Join-Path $IosWww $f) -Force
}

$VendorSrc = Join-Path $ProjectRoot "vendor"
$VendorDest = Join-Path $IosWww "vendor"
if (Test-Path $VendorSrc) {
    Copy-Item -Path $VendorSrc -Destination $VendorDest -Recurse -Force
}
Write-Host "  -> Web bundle synchronized to ios/App/www." -ForegroundColor Green

# 3. Validate GoogleService-Info.plist & Info.plist
Write-Host "[3/4] Validating iOS Google OAuth configuration..." -ForegroundColor Yellow
$PlistPath = Join-Path $ProjectRoot "ios\GoogleService-Info.plist"
$InfoPlist = Join-Path $ProjectRoot "ios\Info.plist"

if (-not (Test-Path $PlistPath)) {
    Write-Error "ios/GoogleService-Info.plist not found!"
    exit 1
}

$PlistContent = Get-Content $PlistPath -Raw
if ($PlistContent -match "<string>(com\.googleusercontent\.apps\.[^<]+)</string>") {
    $ReversedClientId = $matches[1]
    Write-Host "  -> Verified REVERSED_CLIENT_ID: $ReversedClientId" -ForegroundColor Green
} else {
    Write-Warning "Could not detect REVERSED_CLIENT_ID in GoogleService-Info.plist"
}

# 4. Build Options Overview
Write-Host "`n[4/4] iOS Build Options:" -ForegroundColor Yellow
Write-Host "----------------------------------------------------"
Write-Host "Option A (macOS Local Build):" -ForegroundColor White
Write-Host "  1. Open terminal on macOS machine."
Write-Host "  2. cd ios && pod install"
Write-Host "  3. xcodebuild -workspace DeadLock.xcworkspace -scheme DeadLock -configuration $Config -archivePath build/DeadLock.xcarchive archive"
Write-Host "  4. xcodebuild -exportArchive -archivePath build/DeadLock.xcarchive -exportOptionsPlist exportOptions.plist -exportPath build/"
Write-Host ""
Write-Host "Option B (Cloud CI/CD - No Mac Needed):" -ForegroundColor White
Write-Host "  Push this repository to GitHub. The GitHub Actions workflow in"
Write-Host "  .github/workflows/build-ios.yml will automatically run on a macOS"
Write-Host "  runner and output the downloadable DeadLock.ipa artifact!"
Write-Host "====================================================" -ForegroundColor Cyan
