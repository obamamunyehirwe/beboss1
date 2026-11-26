param(
    [string]$PfxPath = $(if ($env:WINDOWS_CODESIGN_PFX_PATH) { $env:WINDOWS_CODESIGN_PFX_PATH } else { Join-Path $PSScriptRoot "..\codesign.pfx" }),
    [string]$InstallerDirectory = (Join-Path $PSScriptRoot "..\src-tauri\target\release\bundle\nsis"),
    [string]$TimestampUrl = "https://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

$publiclyExposedPfxSha256 = "c487f1351980a2f10713ec085175ce17914b16e30885cdd966baffe9aeac6927"
$password = [string]$env:WINDOWS_CODESIGN_PFX_PASSWORD

if ([string]::IsNullOrWhiteSpace($password)) {
    throw "Set WINDOWS_CODESIGN_PFX_PASSWORD in the current PowerShell session. Do not put the password in the command line or a tracked file."
}
if (-not (Test-Path -LiteralPath $PfxPath -PathType Leaf)) {
    throw "The signing PFX was not found at '$PfxPath'. Set WINDOWS_CODESIGN_PFX_PATH or pass -PfxPath."
}

$pfxBytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $PfxPath).Path)
$certificate = $null
$certificateSubject = ""
try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $pfxHash = ([BitConverter]::ToString($sha.ComputeHash($pfxBytes))).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }

    if ($pfxHash -eq $publiclyExposedPfxSha256) {
        throw "This is the exact PFX previously committed to the public BeBoss repository. It is considered compromised and is blocked from signing. Revoke it and use a newly issued certificate."
    }

    try {
        $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
        $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($pfxBytes, $password, $flags)
    } catch {
        throw "The PFX could not be opened. Check the file and WINDOWS_CODESIGN_PFX_PASSWORD. $($_.Exception.Message)"
    }

    if (-not $certificate.HasPrivateKey) {
        throw "The PFX does not contain its private signing key."
    }
    $now = [DateTime]::UtcNow
    if ($certificate.NotBefore.ToUniversalTime() -gt $now -or $certificate.NotAfter.ToUniversalTime() -le $now) {
        throw "The signing certificate is not currently valid."
    }

    $ekuExtension = $certificate.Extensions |
        Where-Object { $_ -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } |
        Select-Object -First 1
    $hasCodeSigningUsage = $false
    if ($ekuExtension) {
        foreach ($usage in $ekuExtension.EnhancedKeyUsages) {
            if ($usage.Value -eq "1.3.6.1.5.5.7.3.3") {
                $hasCodeSigningUsage = $true
                break
            }
        }
    }
    if (-not $hasCodeSigningUsage) {
        throw "The certificate does not include the Code Signing extended key usage."
    }

    $certificateSubject = $certificate.Subject
    Write-Host "Certificate identity: $certificateSubject"
    Write-Host "Certificate thumbprint: $($certificate.Thumbprint)"
    Write-Host "Certificate expires: $($certificate.NotAfter.ToUniversalTime().ToString('yyyy-MM-dd')) UTC"
} finally {
    if ($certificate) { $certificate.Dispose() }
    [Array]::Clear($pfxBytes, 0, $pfxBytes.Length)
}

if (-not (Test-Path -LiteralPath $InstallerDirectory -PathType Container)) {
    throw "The NSIS output directory does not exist. Build first with: npm run dist:win"
}
$installers = @(Get-ChildItem -LiteralPath $InstallerDirectory -Filter "*.exe" -File | Where-Object { $_.Length -gt 1MB })
if ($installers.Count -eq 0) {
    throw "No installable NSIS executable was found in '$InstallerDirectory'."
}

$sdkBin = Join-Path ([Environment]::GetFolderPath("ProgramFilesX86")) "Windows Kits\10\bin"
$signTool = Get-ChildItem -Path (Join-Path $sdkBin "*\x64\signtool.exe") -File -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $signTool) {
    throw "Windows SDK signtool.exe was not found. Install the Windows 10/11 SDK and retry."
}

foreach ($installer in $installers) {
    Write-Host "Signing $($installer.Name)..."
    & $signTool sign /fd SHA256 /td SHA256 /tr $TimestampUrl /f (Resolve-Path -LiteralPath $PfxPath).Path /p $password $installer.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "Authenticode signing failed for $($installer.Name)."
    }

    & $signTool verify /pa /v $installer.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "Windows trust verification failed for $($installer.Name). Use a trusted code-signing certificate."
    }

    $signature = Get-AuthenticodeSignature -FilePath $installer.FullName
    if ($signature.Status -ne "Valid") {
        throw "Windows reports an invalid signature for $($installer.Name): $($signature.StatusMessage)"
    }

    $digest = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $checksumPath = "$($installer.FullName).sha256"
    "$digest  $($installer.Name)" | Set-Content -LiteralPath $checksumPath -Encoding ASCII
    Write-Host "Verified: $($installer.FullName)"
    Write-Host "SHA-256: $digest"
}

$signatureStatus = Join-Path $InstallerDirectory "signature-status.txt"
@("signature=Authenticode signed and verified", "certificate=$certificateSubject") | Set-Content -LiteralPath $signatureStatus -Encoding UTF8
Write-Host "Windows installer signing and verification completed."
