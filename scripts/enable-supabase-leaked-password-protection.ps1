[CmdletBinding()]
param(
    [Parameter()]
    [ValidatePattern('^[a-z0-9]{20}$')]
    [string]$ProjectRef = "ahlpvlhmpfiyeoercxol"
)

$ErrorActionPreference = "Stop"
$token = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "Process")

if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Set SUPABASE_ACCESS_TOKEN in this PowerShell session. The token is never written to disk by this script."
}

$headers = @{ Authorization = "Bearer $token" }
$endpoint = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"

try {
    $current = Invoke-RestMethod -Method Get -Uri $endpoint -Headers $headers
} catch {
    throw "Could not read Supabase Auth configuration. Check the project reference and grant auth_config_read to this Management API token. $($_.Exception.Message)"
}

if ($current.password_hibp_enabled -eq $true) {
    Write-Output "Verified: leaked-password protection is already enabled for project $ProjectRef."
    exit 0
}

$body = @{ password_hibp_enabled = $true } | ConvertTo-Json -Compress
try {
    $null = Invoke-RestMethod -Method Patch -Uri $endpoint -Headers $headers -ContentType "application/json" -Body $body
} catch {
    throw "Supabase did not accept the Auth configuration update. Leaked-password protection is plan-gated; confirm Pro, Team, or Enterprise eligibility and grant auth_config_write plus project_admin_write. $($_.Exception.Message)"
}

$verified = Invoke-RestMethod -Method Get -Uri $endpoint -Headers $headers
if ($verified.password_hibp_enabled -ne $true) {
    throw "The update request returned, but the follow-up read did not confirm password_hibp_enabled=true. Do not consider this setting enabled."
}

Write-Output "Verified: leaked-password protection is ENABLED for project $ProjectRef."
