# BeBoss first-admin setup

## Approved first administrator

The live Supabase project currently has this single bootstrap allow-list entry:

- Email: `reponsekdz@gmail.com`
- Password: **not created yet**. Supabase has created the Auth user in the invited state (`invited_at` is set; `email_confirmed_at` is still null). The one-time invitation was successfully sent on 2026-11-21. There is no existing password to disclose; the administrator must accept the email link and choose a private password.

Do not add a default password, seed a password in source code, or enable public self-registration.

## Required deployment configuration

For the web site and subsequent team invitations, configure these values in the web host's environment:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL, server-side |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key used by the server auth middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key used only by server functions; never expose it as a `VITE_*` variable |
| `VITE_SUPABASE_URL` | Public Supabase URL injected into the browser bundle |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase publishable key injected into the browser bundle |
| `BEBOSS_ADMIN_URL` | Canonical admin invite URL: `https://admin.beboss.rw/reset-password?invite=1` |

Add `https://admin.beboss.rw/reset-password?invite=1` to Supabase Auth's allowed redirect URLs. Configure a working email provider/SMTP sender in Supabase so invitations are delivered. Keep public sign-up disabled (`enable_signup = false`); the invitation endpoint uses the service-role invite API and does not enable public registration.

## First sign-in sequence

1. Open `/auth` on `https://admin.beboss.rw`.
2. Choose **Send first-admin setup invitation**. The Edge Function accepts requests only from the canonical admin origin and reads the one approved address from `admin_bootstrap_emails`; the browser cannot choose another email or submit a password.
3. Open the invitation sent to `reponsekdz@gmail.com`, follow the secure link, and set a new password on `/reset-password` (at least 10 characters).
4. After Supabase confirms the invited email, the existing `handle_admin_bootstrap()` trigger grants the `admin` role and creates the admin profile.
5. Return to `/auth` and sign in with the approved email and the password you just created.

The bootstrap invitation is one-time. The server records its reservation in the service-only `app_secrets` table to prevent duplicate public invitation requests. The first invitation was sent successfully by Supabase on 2026-11-21; the live account is in the invited but not yet email-confirmed state until the email link is accepted. If the email is not received, check Supabase Auth email logs, SMTP configuration, and Spam. Do not manually insert a password or role using a browser client.

## Existing app behavior

- Admin login is email/password only.
- Public account creation remains disabled.
- Master-admin and support roles remain separate.
- Additional team members are invited from Admin → Admin team after the first administrator has signed in.

## Mobile signing-security migration

The current source branch uses versioned `BB3` unlock codes signed with ECDSA P-256 / SHA-256:

- The private key is stored only in the live Supabase `app_secrets` row `BEBOSS_UNLOCK_ECDSA_PRIVATE_KEY_PEM`.
- The Android 2.2.0 source pins only the matching public key and verifies BB3 signatures offline.
- The web admin, Android admin console and exported HTML portal request new BB3 signatures from the authenticated server function. They do not generate a client-side HMAC signature.
- Historical BB2 codes are accepted only online when the exact code exists in the trusted BeBoss `unlock_codes` table, matches the account, remains `ISSUED`, and can be atomically redeemed. Codes generated locally with the former shared HMAC key but never stored as an admin-issued row are rejected by the new app.
- For a BB3 code redeemed while online, BeBoss atomically claims the database row so a second device cannot redeem it. When the cloud is unreachable, the app can still verify the public-key signature offline and records local anti-replay state.

**Important upgrade requirement:** a secret cannot be removed from APK files that were already downloaded. Devices still running an older BeBoss APK may still contain the old BB2 HMAC secret and old local verifier. Build and distribute the new signed Android **2.2.0 / versionCode 4** APK, then move users onto that build. Do not claim existing installed APKs have been retroactively secured. The old server-side `BEBOSS_UNLOCK_SIGNING_SECRET` row is retained temporarily for rollback/legacy deployment compatibility; the new source and BB3 issuance path do not use it. Remove it only after the old web deployment is retired and all required legacy compatibility has been reviewed.


## Mobile release status to verify

The live release metadata currently advertises version `2.0.0`, while the Android source tree is configured as `2.1.0`. The private `releases` storage bucket currently has no APK objects, and no GitHub release attachment is present. The website's stable download endpoint deliberately returns HTTP 503 when a release record has no matching private object.

Do not change the version pointer or publish a checksum until a real signed APK has been built from the verified source and uploaded through Admin → App releases. After upload, verify that the stored object path matches `app_releases.file_path`, the SHA-256 matches the binary, and `/api/public/download/latest` returns a successful redirect.
