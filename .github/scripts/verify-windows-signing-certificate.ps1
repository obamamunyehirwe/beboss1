$ErrorActionPreference = "Stop"

# This exact PKCS#12 file was committed as desktop/codesign.pfx in the public
# repository. Its private key must never be used for a production signature.
$publiclyExposedPfxSha256 = "c487f1351980a2f10713ec085175ce17914b16e30885cdd966baffe9aeac6927"

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CODESIGN_PFX_BASE64) -or
    [string]::IsNullOrWhiteSpace($env:WINDOWS_CODESIGN_PFX_PASSWORD)) {
    throw "Configure WINDOWS_CODESIGN_PFX_BASE64 and WINDOWS_CODESIGN_PFX_PASSWORD as protected GitHub Actions secrets."
}

$normalizedBase64 = $env:WINDOWS_CODESIGN_PFX_BASE64 -replace "\s", ""
try {
    $certificateBytes = [Convert]::FromBase64String($normalizedBase64)
} catch {
    throw "WINDOWS_CODESIGN_PFX_BASE64 is not valid base64-encoded PKCS#12 data."
}

try {
    $actualPfxSha256 = [Convert]::ToHexString(
        [System.Security.Cryptography.SHA256]::HashData($certificateBytes)
    ).ToLowerInvariant()

    if ($actualPfxSha256 -eq $publiclyExposedPfxSha256) {
        throw "The configured PFX is the exact certificate file previously committed to this public repository. Revoke it and replace both Windows signing secrets with a newly issued certificate before publishing."
    }

    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
        $certificateBytes,
        $env:WINDOWS_CODESIGN_PFX_PASSWORD,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
    )

    try {
        if (-not $certificate.HasPrivateKey) {
            throw "The configured PFX does not contain its private key."
        }

        $now = [DateTime]::UtcNow
        if ($certificate.NotBefore.ToUniversalTime() -gt $now -or
            $certificate.NotAfter.ToUniversalTime() -le $now) {
            throw "The configured Authenticode certificate is not currently valid."
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
            throw "The configured certificate does not include the Code Signing extended key usage."
        }

        Write-Host "Validated a replacement Authenticode code-signing certificate."
        Write-Host "Certificate thumbprint: $($certificate.Thumbprint)"
        Write-Host "Certificate expiry (UTC): $($certificate.NotAfter.ToUniversalTime().ToString('yyyy-MM-dd'))"
    } finally {
        $certificate.Dispose()
    }
} finally {
    [Array]::Clear($certificateBytes, 0, $certificateBytes.Length)
}
