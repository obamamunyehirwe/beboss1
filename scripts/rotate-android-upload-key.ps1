# Generate a new Android upload key outside the repository.
# Passwords are requested interactively by keytool and are never passed as process arguments.

$ErrorActionPreference = "Stop"

if (-not (Get-Command keytool -ErrorAction SilentlyContinue)) {
    throw "keytool was not found. Install a JDK 17+ and add its bin directory to PATH."
}

$signingDirectory = Join-Path $env:USERPROFILE ".beboss\android-signing"
New-Item -ItemType Directory -Force -Path $signingDirectory | Out-Null
$alias = "beboss-upload-2026"
$keystore = Join-Path $signingDirectory "beboss-upload-2026.p12"
$certificate = Join-Path $signingDirectory "beboss-upload-2026-certificate.pem"

if (Test-Path $keystore) {
    throw "Refusing to overwrite an existing signing key: $keystore"
}
if (Test-Path $certificate) {
    throw "Refusing to overwrite an existing certificate export: $certificate"
}

Write-Host "Creating a new PKCS#12 upload key outside the repository."
Write-Host "Store and key passwords will be requested securely by keytool."
& keytool -genkeypair -v -storetype PKCS12 -keystore $keystore -alias $alias -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=BeBoss Android Upload,O=BeBoss Retail,C=RW"
if ($LASTEXITCODE -ne 0) { throw "keytool failed to create the new upload key." }

Write-Host "Exporting the public certificate. This file contains no private key."
& keytool -exportcert -rfc -keystore $keystore -alias $alias -file $certificate
if ($LASTEXITCODE -ne 0) { throw "keytool failed to export the upload certificate." }

$pem = Get-Content -Raw -Path $certificate
$base64 = ($pem -replace "-----BEGIN CERTIFICATE-----", "" -replace "-----END CERTIFICATE-----", "" -replace "\s", "")
$raw = [Convert]::FromBase64String($base64)
$x509 = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($raw)
$sha = [System.Security.Cryptography.SHA256]::Create()
$fingerprint = [BitConverter]::ToString($sha.ComputeHash($x509.RawData)).Replace("-", "")

Write-Host ""
Write-Host "New upload key created:"
Write-Host "  Keystore: $keystore"
Write-Host "  Alias:    $alias"
Write-Host "  Public certificate: $certificate"
Write-Host "  SHA-256:  $fingerprint"
Write-Host ""
Write-Host "Next: submit the PEM certificate to Google Play Console using the official upload-key reset flow."
Write-Host "After Google Play accepts the certificate, update KEYSTORE_PATH, STORE_PASSWORD, KEY_PASSWORD, KEY_ALIAS and ANDROID_UPLOAD_CERT_SHA256 in your ignored root .env / protected CI variables."
Write-Host "Never commit the .p12 file, paste passwords into chat, or replace an installed app's signing certificate without the Play App Signing upgrade process."
