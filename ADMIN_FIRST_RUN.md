# BeBoss first-admin setup

## Approved first administrator

The live Supabase project currently has this single bootstrap allow-list entry:

- Email: `reponsekdz@gmail.com`
- Password: **not created yet**. There is no Auth user for this address in the current project, so there is no existing password to recover or disclose. The administrator must choose a private password from the one-time invitation email.

Do not add a default password, seed a password in source code, or enable public self-registration.

## Required deployment configuration

Before the first-admin button can send an invitation, configure these values in the web host's environment:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL, server-side |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key used by the server auth middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key used only by server functions; never expose it as a `VITE_*` variable |
| `VITE_SUPABASE_URL` | Public Supabase URL injected into the browser bundle |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase publishable key injected into the browser bundle |
| `BEBOSS_ADMIN_URL` | Exact production URL ending in `/reset-password?invite=1` |

Add the `BEBOSS_ADMIN_URL` origin/path to Supabase Auth's allowed redirect URLs. Configure a working email provider/SMTP sender in Supabase so the invitation is actually delivered. Keep the existing `enable_signup = false` setting.

## First sign-in sequence

1. Deploy the web branch containing the one-time bootstrap endpoint.
2. Open `/auth` on the real production domain.
3. Choose **Send first-admin setup invitation**. The server reads the one approved address from `admin_bootstrap_emails`; the browser cannot choose another address or submit a password.
4. Open the invitation sent to `reponsekdz@gmail.com`, follow the secure link, and set a new password on `/reset-password` (at least 10 characters).
5. After Supabase confirms the invited email, the existing `handle_admin_bootstrap()` trigger grants the `admin` role and creates the admin profile.
6. Return to `/auth` and sign in with the approved email and the password you just created.

The bootstrap invitation is one-time. The server records its reservation in the service-only `app_secrets` table to prevent duplicate public invitation requests. If the email is not received, first check Supabase Auth email logs, SMTP configuration, and the spam folder; do not manually insert a password or role using a browser client.

## Existing app behavior

- Admin login is email/password only.
- Public account creation remains disabled.
- Master-admin and support roles remain separate.
- Additional team members are invited from Admin → Admin team after the first administrator has signed in.

## Production security note

The current mobile BB2 implementation still verifies legacy unlock codes using a shared HMAC secret supplied to the Android build. A secret compiled into a distributed APK cannot be treated as confidential. Removing that shared secret immediately would invalidate existing offline BB2 verification, so a backward-compatible asymmetric-signature migration is still required before claiming the entire mobile/web system is fully production-secure. The older embedded HTML portal no longer contains its former hardcoded HMAC fallback and does not persist the manually supplied key in local storage, but that is only a partial mitigation.
