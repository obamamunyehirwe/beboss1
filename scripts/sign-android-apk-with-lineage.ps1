param(
    [Parameter(Mandatory = $true)]
    [string]$InputApk,
    [Parameter(Mandatory = $true)]
    [string]$OutputApk,
    [Parameter(Mandatory = $true)]
    [string]$OldKeystore,
    [Parameter(Mandatory = $true)]
    [string]$OldAlias,
    [Parameter(Mandatory = $true)]
    [string]$NewKeystore,
    [Parameter(Mandatory = $true)]
    [string]$NewAlias,
    [Parameter(Mandatory = $true)]
    [string]$Lineage,
    [ValidateRange(28, 33)]
    [int]$RotationMinSdkVersion = 28
)

$ErrorActionPreference = "Stop"

function Resolve-ApkSigner {
    $command = Get-Command apksigner -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $sdk = $env:ANDROID_SDK_ROOT
    if (-not $sdk) { $sdk = $env:ANDROID_HOME }
    if ($sdk) {
        $candidate = Get-ChildItem -Path (Join-Path $sdk "build-tools") -Filter "apksigner.bat" -Recurse -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
        if ($candidate) { return $candidate.FullName }
    }
    throw "apksigner was not found. Install Android SDK Build Tools and configure ANDROID_SDK_ROOT."
}

foreach ($path in @($InputApk, $OldKeystore, $NewKeystore, $Lineage)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required signing input does not exist: $path"
    }
}
if ([IO.Path]::GetFullPath($InputApk) -eq [IO.Path]::GetFullPath($OutputApk)) {
    throw "OutputApk must be a different path. The original build artifact must remain untouched."
}
if (Test-Path -LiteralPath $OutputApk) {
    throw "Refusing to overwrite an existing APK: $OutputApk"
}
if ([IO.Path]::GetExtension($InputApk) -ine ".apk" -or [IO.Path]::GetExtension($OutputApk) -ine ".apk") {
    throw "InputApk and OutputApk must both be .apk files."
}
if ([IO.Path]::GetFullPath($OldKeystore) -eq [IO.Path]::GetFullPath($NewKeystore)) {
    throw "Old and new signing keystores must be different files."
}

$apksigner = Resolve-ApkSigner
$outputDirectory = Split-Path -Parent ([IO.Path]::GetFullPath($OutputApk))
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

Write-Warning "Signing needs the old and new private keys. apksigner will prompt; passwords are not passed as command-line arguments."
Write-Warning "Android 7/8 devices (API 24–27) still verify with the historical signer. Test these devices separately; they remain dependent on the old key."
$arguments = @(
    "sign",
    "--ks", $OldKeystore, "--ks-key-alias", $OldAlias,
    "--next-signer", "--ks", $NewKeystore, "--ks-key-alias", $NewAlias,
    "--lineage", $Lineage,
    "--rotation-min-sdk-version", [string]$RotationMinSdkVersion,
    "--out", $OutputApk,
    $InputApk
)
& $apksigner @arguments
if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $OutputApk) { Remove-Item -LiteralPath $OutputApk -Force }
    throw "apksigner failed to create the rotated APK."
}

foreach ($range in @(@{Min=24; Max=27}, @{Min=28; Max=32}, @{Min=33; Max=100})) {
    $verifyArguments = @("verify", "--verbose", "--min-sdk-version", [string]$range.Min, "--max-sdk-version", [string]$range.Max, $OutputApk)
    & $apksigner @verifyArguments
    if ($LASTEXITCODE -ne 0) {
        throw "The rotated APK did not verify for Android API $($range.Min)–$($range.Max). Do not publish it."
    }
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputApk).Hash
Write-Host ""
Write-Host "Rotated APK signature verification passed for API 24–27, 28–32 and 33+."
Write-Host "  Output: $([IO.Path]::GetFullPath($OutputApk))"
Write-Host "  SHA-256: $hash"
Write-Host "Next: independently inspect package ID, versionCode and signing lineage, install over a backed-up test device, then publish the final signed APK through BeBoss Admin."
