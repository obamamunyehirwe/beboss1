param(
    [Parameter(Mandatory = $true)]
    [string]$OldKeystore,
    [Parameter(Mandatory = $true)]
    [string]$OldAlias,
    [Parameter(Mandatory = $true)]
    [string]$NewKeystore,
    [Parameter(Mandatory = $true)]
    [string]$NewAlias,
    [Parameter(Mandatory = $true)]
    [string]$OutputLineage,
    [string]$ExistingLineage = ""
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

foreach ($path in @($OldKeystore, $NewKeystore)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Signing keystore does not exist: $path"
    }
}
if ([IO.Path]::GetFullPath($OldKeystore) -eq [IO.Path]::GetFullPath($NewKeystore)) {
    throw "Old and new signing keystores must be different files."
}
if ([string]::IsNullOrWhiteSpace($OldAlias) -or [string]::IsNullOrWhiteSpace($NewAlias)) {
    throw "Both signing aliases are required."
}
if ([string]::IsNullOrWhiteSpace($OutputLineage)) {
    throw "OutputLineage is required."
}
if (Test-Path -LiteralPath $OutputLineage) {
    throw "Refusing to overwrite an existing signing lineage: $OutputLineage"
}
if ($ExistingLineage -and -not (Test-Path -LiteralPath $ExistingLineage -PathType Leaf)) {
    throw "Existing lineage file does not exist: $ExistingLineage"
}

$apksigner = Resolve-ApkSigner
$outputDirectory = Split-Path -Parent ([IO.Path]::GetFullPath($OutputLineage))
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

Write-Warning "This operation needs both the old and new private signing keys. apksigner will prompt for keystore passwords."
Write-Warning "The old BeBoss signing key was exposed in Git history. A lineage does not retroactively restore its secrecy."
$arguments = @("rotate")
if ($ExistingLineage) {
    $arguments += @("--in", $ExistingLineage)
}
$arguments += @(
    "--out", $OutputLineage,
    "--old-signer", "--ks", $OldKeystore, "--ks-key-alias", $OldAlias,
    "--new-signer", "--ks", $NewKeystore, "--ks-key-alias", $NewAlias
)

& $apksigner @arguments
if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $OutputLineage) { Remove-Item -LiteralPath $OutputLineage -Force }
    throw "apksigner could not create the signing lineage."
}

$details = & $apksigner lineage --in $OutputLineage --print-certs 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "The generated signing lineage could not be inspected: $($details -join [Environment]::NewLine)"
}

Write-Host "Signing lineage generated and inspected:"
Write-Host "  $([IO.Path]::GetFullPath($OutputLineage))"
Write-Host ($details -join [Environment]::NewLine)
Write-Host "Use this lineage only with the matching old/new signer keys and test the APK across supported Android API levels."
