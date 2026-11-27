param(
    [string]$ArtifactPath = "",
    [switch]$KeepGradleDaemon
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$gradleWrapper = Join-Path $root "gradlew.bat"
$gradleFile = Join-Path $root "app\build.gradle.kts"
$envFile = Join-Path $root ".env"

if (-not (Test-Path -LiteralPath $gradleWrapper -PathType Leaf)) {
    throw "Run this script from a complete BeBoss source checkout containing gradlew.bat."
}
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "The ignored repository-root .env file is required for the customer release configuration."
}
if (-not (Test-Path -LiteralPath $gradleFile -PathType Leaf)) {
    throw "app/build.gradle.kts was not found."
}

$gradleSource = Get-Content -Raw -LiteralPath $gradleFile
$applicationIdMatch = [regex]::Match($gradleSource, 'applicationId\s*=\s*"([^"]+)"')
$secureFlavorMatch = [regex]::Match(
    $gradleSource,
    'create\("secure"\)\s*\{(?<body>[\s\S]*?)\n\s*\}',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
)
if (-not $applicationIdMatch.Success -or -not $secureFlavorMatch.Success) {
    throw "Could not read the Android application ID and secure production flavor from Gradle."
}
$expectedApplicationId = $applicationIdMatch.Groups[1].Value
$secureFlavor = $secureFlavorMatch.Groups["body"].Value
$versionCodeMatch = [regex]::Match($secureFlavor, 'versionCode\s*=\s*(\d+)')
$versionNameMatch = [regex]::Match($secureFlavor, 'versionName\s*=\s*"([^"]+)"')
if (-not $versionCodeMatch.Success -or -not $versionNameMatch.Success) {
    throw "The secure production flavor must declare versionCode and versionName."
}
$expectedVersionCode = [long]$versionCodeMatch.Groups[1].Value
$expectedVersionName = $versionNameMatch.Groups[1].Value
if ($expectedApplicationId -ne "com.beboss.shopmgmt" -or $expectedVersionCode -lt 20) {
    throw "The configured secure production identity/version does not match the approved BeBoss direct APK channel."
}

Push-Location $root
try {
    $gradleArgs = @(
        "--stacktrace",
        ":app:validateReleaseSigningConfiguration",
        ":app:validateSecureMigrationApproval",
        ":app:validateSentryDsnConfiguration",
        ":app:validateAndroidCloudConfiguration",
        ":app:testSecureDebugUnitTest",
        ":app:assembleSecureRelease"
    )
    if (-not $KeepGradleDaemon) { $gradleArgs = @("--no-daemon") + $gradleArgs }
    & $gradleWrapper @gradleArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle release validation, secure unit tests or secure APK assembly failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

if ([string]::IsNullOrWhiteSpace($ArtifactPath)) {
    $ArtifactPath = Join-Path $root "app\build\outputs\apk\secure\release\app-secure-release.apk"
} elseif (-not [IO.Path]::IsPathRooted($ArtifactPath)) {
    $ArtifactPath = Join-Path $root $ArtifactPath
}
if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
    throw "Gradle completed, but the expected secure production APK was not created: $ArtifactPath"
}
$apk = Get-Item -LiteralPath $ArtifactPath
if ($apk.Length -lt 1MB) {
    throw "The generated APK is unexpectedly small ($($apk.Length) bytes); it will not be published."
}
if ($apk.Length -gt 100MB) {
    throw "The generated APK exceeds the Admin release upload limit of 100 MB ($($apk.Length) bytes). Reduce the package before publishing."
}

$sdk = $env:ANDROID_SDK_ROOT
if ([string]::IsNullOrWhiteSpace($sdk)) { $sdk = $env:ANDROID_HOME }
if ([string]::IsNullOrWhiteSpace($sdk)) {
    throw "Set ANDROID_SDK_ROOT to the installed Android SDK directory so the APK can be inspected and verified."
}
$buildToolsRoot = Join-Path $sdk "build-tools"
$buildTools = Get-ChildItem -LiteralPath $buildToolsRoot -Directory -ErrorAction Stop |
    Sort-Object { try { [version]$_.Name } catch { [version]"0.0" } } -Descending |
    Select-Object -First 1
if (-not $buildTools) { throw "Android SDK build-tools were not found." }
$aapt = Join-Path $buildTools.FullName "aapt.exe"
if (-not (Test-Path -LiteralPath $aapt -PathType Leaf)) { throw "aapt.exe is missing from $($buildTools.FullName)." }
$zipalign = Join-Path $buildTools.FullName "zipalign.exe"
if (-not (Test-Path -LiteralPath $zipalign -PathType Leaf)) { throw "zipalign.exe is missing from $($buildTools.FullName)." }
$alignment = & $zipalign -c -v 4 $apk.FullName 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "APK zip alignment verification failed: $($alignment -join [Environment]::NewLine)"
}

$badging = & $aapt dump badging $apk.FullName 2>&1
if ($LASTEXITCODE -ne 0) { throw "aapt could not inspect the generated APK: $($badging -join [Environment]::NewLine)" }
$packageLine = $badging | Where-Object { $_ -match "^package:" } | Select-Object -First 1
if (-not $packageLine -or $packageLine -notmatch "name='([^']+)'\s+versionCode='(\d+)'\s+versionName='([^']*)'") {
    throw "The APK package name/version metadata could not be read."
}
$actualApplicationId = $Matches[1]
$actualVersionCode = [long]$Matches[2]
$actualVersionName = $Matches[3]
if ($actualApplicationId -ne $expectedApplicationId -or
    $actualVersionCode -ne $expectedVersionCode -or
    $actualVersionName -ne $expectedVersionName) {
    throw "Generated APK metadata does not match the secure Gradle flavor. Expected $expectedApplicationId $expectedVersionName ($expectedVersionCode); found $actualApplicationId $actualVersionName ($actualVersionCode)."
}

$verifyScript = Join-Path $root "scripts\verify-android-release-signing.ps1"
& $verifyScript -ArtifactPath $apk.FullName
if ($LASTEXITCODE -ne 0) {
    throw "APK signing-certificate verification failed. Do not publish this file."
}

$checksum = (Get-FileHash -LiteralPath $apk.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$checksumPath = $apk.FullName + ".sha256"
"$checksum  $($apk.Name)" | Set-Content -LiteralPath $checksumPath -Encoding ASCII

Write-Host "Secure production APK built and inspected successfully."
Write-Host "Application: $actualApplicationId"
Write-Host "Version: $actualVersionName ($actualVersionCode)"
Write-Host "Artifact: $($apk.FullName)"
Write-Host "SHA-256: $checksum"
Write-Host "Checksum file: $checksumPath"
Write-Host "Next: upload this exact APK in BeBoss Admin -> App Releases -> Mobile releases."
