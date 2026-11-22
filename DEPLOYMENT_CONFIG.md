# BeBoss production deployment runbook

This repository contains an Android POS app in `/app` and a TanStack Start web site/admin portal in `/web`. The production Supabase project linked by `web/supabase/config.toml` is `ahlpvlhmpfiyeoercxol` (EU Central).

## 1. Web deployment (Vercel)

Set these environment variables for Production, Preview and Development as appropriate:

| Variable | Use | Exposure |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Public URL |
| `SUPABASE_PUBLISHABLE_KEY` | Web Supabase client / server-side user requests | Public publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted server functions only (admin invitations, private storage, privileged operations); use the Supabase Secret API key (`sb_secret_...`) where available | Server-only Secret in Vercel |
| `BEBOSS_SECURITY_PEPPER` | Security hashing/derivation | Server-only secret |
| `BEBOSS_DATASHARE_HMAC_SECRET` | Signed data-share requests | Server-only secret |
| `BEBOSS_LAN_SYNC_SECRET` | LAN sync authentication | Server-only secret |
| `BEBOSS_ADMIN_WHATSAPP` | Support contact shown to merchants | Public display value |
| `BEBOSS_ADMIN_URL` | Invitation redirect, `https://admin.beboss.rw/reset-password?invite=1` | Public URL |

The BB3 ECDSA P-256 private key is provisioned in the live Supabase `app_secrets` table as `BEBOSS_UNLOCK_ECDSA_PRIVATE_KEY_PEM`. It is not a Vercel environment variable and must never be placed in an Android Gradle property, APK asset, browser bundle, or `VITE_*` variable. Android contains only the matching public verification key.

To resolve a missing `SUPABASE_SERVICE_ROLE_KEY` on Vercel, open Supabase → Project Settings → API Keys and copy the project Secret API key (`sb_secret_...`; the legacy `service_role` key is supported during migration). In Vercel → BeBoss project → Settings → Environment Variables, add the exact variable name `SUPABASE_SERVICE_ROLE_KEY`, choose **Secret**, paste the key as its value, and enable **Production** (also Preview/Development only when those environments need the admin server). Keep `SUPABASE_URL` present for the same environment. Save and create a new Production deployment; changed environment variables do not modify existing deployments. Never add a `VITE_` prefix to this variable. The Vite configuration intentionally injects only the URL and publishable key into browser code. Never paste this value into chat, source code, Android, browser storage, or a `VITE_*` variable.

Build and deploy from the `web` directory:

```bash
npm ci
npm run lint
npm run test
npm run build
```

The GitHub `main` branch is connected to Vercel for production deployment. Confirm the Vercel deployment is Ready after merging, then verify the public site, `/auth`, `/admin`, `/download`, and the status page.

## 2. Supabase Authentication and first admin

The web admin screen uses email/password only. Public self-registration and Google/Lovable sign-in buttons are not part of the admin login flow.

1. In Supabase, open Authentication → URL Configuration. Set the Site URL to the canonical production web origin.
2. Add the canonical production `/auth` and `/reset-password` URLs to Redirect URLs, including the invite URL `/reset-password?invite=1`. Add local development URLs and the exact Vercel preview pattern only if preview logins are required.
3. Keep the email/password provider enabled and require email confirmation. Keep the top-level Auth setting `enable_signup = false`; this blocks public self-registration while the service-role invite API remains available.
4. The database has a protected `admin_bootstrap_emails` allow-list and an Auth trigger that gives the allow-listed first account the master-admin role after its email is confirmed.
5. Open `https://admin.beboss.rw/auth` and choose **Send first-admin setup invitation**. The deployed Edge Function only accepts requests from this exact admin origin, reads the approved email from the allow-list, and sends the invitation without accepting a caller-supplied email or password.
6. Accept the invitation at `https://admin.beboss.rw/reset-password?invite=1`, set a password of at least 10 characters, then sign in at `/auth`. The first allow-listed account has already had an invitation issued in the live project; it remains invited until the email link is accepted.
7. After the first master admin has signed in, use Admin → Admin team to invite additional administrators or support users. Keep all privileged admin functions protected by the Supabase role check.

Set `BEBOSS_ADMIN_URL=https://admin.beboss.rw/reset-password?invite=1` for the separate team-invitation server function and add that exact URL to Supabase Auth Redirect URLs. The invite acceptance page verifies the Supabase invitation session before enabling password setup.

## 3. Android production build

The Android 2.2.0 app reads the Supabase URL and public Supabase anon/publishable key from Gradle properties. It embeds only the BB3 public verification key; it never receives the BB3 private signing key. A previously downloaded APK cannot be retroactively changed, so distribute this new signed version before claiming existing devices are migrated.

```properties
SUPABASE_URL=https://ahlpvlhmpfiyeoercxol.supabase.co
SUPABASE_ANON_KEY=replace_with_project_anon_key
```

Do not commit real credentials or the release keystore. Configure release signing values as CI secrets, build with `./gradlew :app:assembleRelease`, verify the resulting APK signature, and upload the signed APK through Admin → App releases. The public download page uses the private Supabase Storage release object; verify a real APK upload and update the live release metadata/checksum to 2.2.0 before announcing downloads as production-ready.

## 4. Production verification checklist

- [ ] Vercel Production deployment is Ready and serves the expected commit.
- [ ] Supabase URL and publishable key are present in Vercel; service-role and signing secrets are server-only.
- [ ] Supabase Site URL and redirect allow-list match the canonical production origin.
- [ ] The first allow-listed master-admin account is created and email-confirmed.
- [ ] An admin can sign in, access the admin portal, and pass the server-side role check.
- [ ] A master admin can invite a support user, and that user can sign in after accepting the invitation.
- [ ] Unauthorized accounts cannot access admin routes or privileged server functions.
- [ ] A signed APK has been uploaded to the private `releases` bucket and the public download flow has been tested.
- [ ] Android release signing, crash reporting, backups, monitoring, and a restore procedure have been verified before public launch.

A green web build does not prove the Supabase Auth account, mail delivery, Android release signing, APK object, custom domain, or production redirects are ready. Verify each item against the live services before announcing production availability.
