$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$required = @(
    "scripts/create-android-signing-lineage.ps1",
    "scripts/sign-android-apk-with-lineage.ps1",
    "scripts/verify-android-release-signing.ps1",
    "scripts/rotate-android-upload-key.ps1",
    "scripts/build-first-production-apk.ps1"
)
foreach ($relative in $required) {
    $path = Join-Path $root $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing Android signing helper: $relative"
    }
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        (Join-Path $root $relative),
        [ref]$tokens,
        [ref]$parseErrors
    ) | Out-Null
    if ($parseErrors.Count -gt 0) {
        throw ("PowerShell parse error in " + $relative + ": " + $parseErrors[0].Message)
    }
}

$sign = Get-Content -Raw -LiteralPath (Join-Path $root "scripts/sign-android-apk-with-lineage.ps1")
foreach ($pattern in @(
    "--lineage",
    "--rotation-min-sdk-version",
    "Min=24;\s*Max=27",
    "Min=28;\s*Max=32",
    "Min=33;\s*Max=100"
)) {
    if ($sign -notmatch $pattern) {
        throw "Android signing helper is missing its rotation/compatibility check: $pattern"
    }
}
$verify = Get-Content -Raw -LiteralPath (Join-Path $root "scripts/verify-android-release-signing.ps1")
if (-not $verify.Contains('Signer #\d+')) {
    throw "Android release verifier does not inspect every signing certificate."
}
Write-Host "Android standalone signing helper PowerShell syntax and structure checks passed."
Write-Host "A real signing run still requires owner-held old/new keystores, a generated lineage and physical/emulator acceptance."
