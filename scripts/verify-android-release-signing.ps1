param(
    [Parameter(Mandatory = $true)]
    [string]$ArtifactPath,
    [string]$ExpectedSha256 = ""
)

$ErrorActionPreference = "Stop"

function Read-RootEnvValue([string]$Name) {
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
    if (-not (Test-Path $envFile)) { return $null }
    foreach ($line in Get-Content $envFile) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*?)\s*$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
    throw "Android release artifact does not exist: $ArtifactPath"
}
if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
    $ExpectedSha256 = $env:ANDROID_RELEASE_CERT_SHA256
}
if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
    $ExpectedSha256 = $env:ANDROID_UPLOAD_CERT_SHA256
}
if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
    $ExpectedSha256 = Read-RootEnvValue "ANDROID_RELEASE_CERT_SHA256"
}
if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
    $ExpectedSha256 = Read-RootEnvValue "ANDROID_UPLOAD_CERT_SHA256"
}
$expected = ($ExpectedSha256 -replace ":", "" -replace "\s", "").ToUpperInvariant()
if ($expected -notmatch "^[A-F0-9]{64}$") {
    throw "Set ANDROID_RELEASE_CERT_SHA256 (or legacy ANDROID_UPLOAD_CERT_SHA256) to the owner-controlled APK signing certificate SHA-256 fingerprint."
}

$extension = [IO.Path]::GetExtension($ArtifactPath).ToLowerInvariant()
if ($extension -eq ".apk") {
    $apksigner = Get-Command apksigner -ErrorAction SilentlyContinue
    if (-not $apksigner) {
        $sdk = $env:ANDROID_SDK_ROOT
        if (-not $sdk) { $sdk = $env:ANDROID_HOME }
        if ($sdk) {
            $candidate = Get-ChildItem -Path (Join-Path $sdk "build-tools") -Filter "apksigner.bat" -Recurse -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending | Select-Object -First 1
            if ($candidate) { $apksigner = $candidate.FullName }
        }
    }
    if (-not $apksigner) { throw "apksigner was not found. Install Android SDK build-tools and add apksigner to PATH." }
    $details = & $apksigner verify --print-certs $ArtifactPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed: $($details -join [Environment]::NewLine)" }
    $line = $details | Where-Object { $_ -match "Signer #1 certificate SHA-256 digest:\s*([A-Fa-f0-9]+)" } | Select-Object -First 1
    if (-not $line -or $line -notmatch "Signer #1 certificate SHA-256 digest:\s*([A-Fa-f0-9]+)") {
        throw "Could not read the APK signer SHA-256 digest."
    }
    $actual = $Matches[1].ToUpperInvariant()
} elseif ($extension -eq ".aab") {
    if (-not (Get-Command keytool -ErrorAction SilentlyContinue)) { throw "keytool is required to inspect an Android App Bundle." }
    $details = & keytool -printcert -jarfile $ArtifactPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "AAB signing certificate inspection failed: $($details -join [Environment]::NewLine)" }
    $line = $details | Where-Object { $_ -match "SHA256:\s*([A-Fa-f0-9:]+)" } | Select-Object -First 1
    if (-not $line -or $line -notmatch "SHA256:\s*([A-Fa-f0-9:]+)") { throw "Could not read the AAB signer SHA-256 fingerprint." }
    $actual = ($Matches[1] -replace ":", "").ToUpperInvariant()
} else {
    throw "Supported artifacts are .apk and .aab."
}

if ($actual -ne $expected) {
    throw "Signing certificate mismatch. Expected $expected but artifact was signed with $actual. Do not publish this artifact."
}
Write-Host "Signature verified. Artifact matches the configured Android release certificate ($actual). No Google Play service is used by this check."
