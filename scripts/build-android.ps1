# Dead Lock - Android Asset Preparation & Build Helper (PowerShell)
# Prepares web bundle, copies www assets to Android assets directory.

param(
    [string]$Config = "Debug"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Dead Lock - Android Build & Asset Packaging Pipeline" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Transpile Frontend Bundle
Write-Host "[1/3] Transpiling frontend with esbuild..." -ForegroundColor Yellow
npx esbuild app.jsx --outfile=app.js
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build app.js!"
    exit 1
}
Write-Host "  -> app.js successfully generated." -ForegroundColor Green

# 2. Prepare Android Web Assets Directory (android/app/src/main/assets/www)
Write-Host "[2/3] Syncing web assets to android/app/src/main/assets/www..." -ForegroundColor Yellow
$AndroidWww = Join-Path $ProjectRoot "android\app\src\main\assets\www"
if (-not (Test-Path $AndroidWww)) {
    New-Item -ItemType Directory -Path $AndroidWww -Force | Out-Null
}

$FilesToCopy = @("index.html", "config.js", "app.js", "manifest.json", "icon.svg", "sw.js")
foreach ($f in $FilesToCopy) {
    Copy-Item (Join-Path $ProjectRoot $f) (Join-Path $AndroidWww $f) -Force
}

$VendorSrc = Join-Path $ProjectRoot "vendor"
$VendorDest = Join-Path $AndroidWww "vendor"
if (Test-Path $VendorSrc) {
    Copy-Item -Path $VendorSrc -Destination $VendorDest -Recurse -Force
}
Write-Host "  -> Web bundle synchronized to android/app/src/main/assets/www." -ForegroundColor Green

# 3. Next steps
Write-Host "[3/3] Android Packaging Ready!" -ForegroundColor Green
Write-Host "----------------------------------------------------"
Write-Host "To compile the .apk binary on GitHub Actions (1-click cloud build):" -ForegroundColor White
Write-Host "  Push changes to GitHub and trigger the 'Build Mobile Packages (.apk & .ipa)' workflow."
Write-Host "  It will generate DeadLock-debug.apk and upload it to Artifacts for immediate phone install."
Write-Host "====================================================" -ForegroundColor Cyan
