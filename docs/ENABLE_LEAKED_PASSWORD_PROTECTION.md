# Enable Supabase leaked-password protection

This is a hosted Supabase Auth setting. It cannot be enabled by a SQL migration, client-side code, or a repository secret injected into the app.

## Apply the setting

The BeBoss production project is `ahlpvlhmpfiyeoercxol`.

The supported Management API endpoint is `PATCH /v1/projects/{ref}/config/auth` with `password_hibp_enabled: true`. Create a fine-grained Supabase Personal Access Token with **Auth configuration: Read** and **Auth configuration: Read-write** / the corresponding `auth_config_read`, `auth_config_write`, and `project_admin_write` permissions.

On Windows PowerShell, enter the token into a secure prompt and run the checked-in script:

```powershell
$secureToken = Read-Host "Supabase Management API token" -AsSecureString
$env:SUPABASE_ACCESS_TOKEN = [System.Net.NetworkCredential]::new("", $secureToken).Password
.\scripts\enable-supabase-leaked-password-protection.ps1
Remove-Item Env:SUPABASE_ACCESS_TOKEN
```

The script reads the current Auth configuration, changes only `password_hibp_enabled`, then reads the setting again and exits unsuccessfully unless the returned value is `true`. It does not store or print the token. Do not paste a Management API token into chat, commit it, or put it in the desktop application's environment.

The setting is plan-gated by Supabase. If the API rejects the update because the project plan is not eligible, upgrade the project to an eligible plan or use the dashboard after confirming the plan.

## Dashboard alternative

Open **Supabase Dashboard → Authentication → Sign In / Providers → Email** and enable **Prevent use of leaked passwords**. Save, then rerun the security advisor and confirm that the `auth_leaked_password_protection` warning is gone.

## Verification evidence

Do not mark this item fixed based on an accepted PATCH response alone. The follow-up GET must report `password_hibp_enabled: true`, and the project's security advisor should no longer report leaked-password protection as disabled.

This control checks passwords against the Pwned Passwords database when users set or change passwords. It does not replace OTP verification, strong owner sessions, device credential rotation, rate limiting, or tenant isolation.
