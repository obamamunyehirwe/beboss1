$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$required = @(
    "scripts/create-android-signing-lineage.ps1",
    "scripts/sign-android-apk-with-lineage.ps1",
    "scripts/verify-android-release-signing.ps1"
)
foreach ($relative in $required) {
    $path = Join-Path $root $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing Android signing helper: $relative"
    }
}
$sign = Get-Content -Raw -LiteralPath (Join-Path $root "scripts/sign-android-apk-with-lineage.ps1")
if ($sign -notmatch '--rotation-min-sdk-version' -or
    $sign -notmatch '"Min=24; Max=27"' -or
    $sign -notmatch '"Min=28; Max=32"' -or
    $sign -notmatch '"Min=33; Max=100"') {
    throw "Android signing helper does not validate all supported API ranges."
}
Write-Host "Android standalone signing helper structure checks passed."
Write-Host "A real signing run still requires owner-held old/new keystores, a generated lineage and physical/emulator acceptance."
