# BeBoss production deployment runbook

This repository contains an Android POS app in `/app` and a TanStack Start web site/admin portal in `/web`. The production Supabase project linked by `web/supabase/config.toml` is `ahlpvlhmpfiyeoercxol` (EU Central).

## 1. Web deployment (Vercel)

Set these environment variables for Production, Preview and Development as appropriate:

| Variable | Use | Exposure |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Public URL |
| `SUPABASE_PUBLISHABLE_KEY` | Web Supabase client / server-side user requests | Public publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted server functions only (admin invitations, private storage, privileged operations) | Server-only secret |
| `BEBOSS_UNLOCK_SIGNING_SECRET` | BB2 unlock-code signing | Server-only secret |
| `BEBOSS_SECURITY_PEPPER` | Security hashing/derivation | Server-only secret |
| `BEBOSS_DATASHARE_HMAC_SECRET` | Signed data-share requests | Server-only secret |
| `BEBOSS_LAN_SYNC_SECRET` | LAN sync authentication | Server-only secret |
| `BEBOSS_ADMIN_WHATSAPP` | Support contact shown to merchants | Public display value |
| `BEBOSS_ADMIN_URL` | Required for new team invitations, e.g. `https://your-domain/reset-password?invite=1` | Public URL |

Never add a `VITE_` prefix to `SUPABASE_SERVICE_ROLE_KEY`. The Vite configuration intentionally injects only the Supabase URL and publishable key into browser code. Keep `.env.example` as a template; never commit actual service-role keys, signing secrets, or passwords.

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
3. Keep the email/password provider enabled and require email confirmation. Set the top-level Auth setting `enable_signup = false` (not `[auth.email].enable_signup = false`, which controls the email provider itself). This blocks public self-registration while leaving password sign-in available. The repo config records the no-public-signup setting; apply it in the hosted Supabase Auth settings after provisioning the first master admin.
4. The database has a protected `admin_bootstrap_emails` allow-list and a trigger that gives the allow-listed first account the master-admin role after its email is confirmed.
5. Create/invite the initial allow-listed master-admin user from Authentication → Users in the Supabase Dashboard, then complete email confirmation before signing in at `/auth`.
6. After the first master admin has signed in, use Admin → Admin team to invite additional administrators or support users. The server uses the service-role client to send invitations and attach the selected role. New invitees land on `/reset-password?invite=1`, set their first password, then continue to the admin portal.
7. Keep all privileged admin functions protected by the Supabase role check. Hiding registration in the UI is not a replacement for the server-side role check.

Set `BEBOSS_ADMIN_URL` to the exact production URL `https://your-domain/reset-password?invite=1` and add that URL to Supabase Redirect URLs. The invite acceptance page verifies the Supabase invitation session before enabling password setup.

## 3. Android production build

The Android app reads the Supabase URL and current legacy anon JWT from Gradle properties:

```properties
SUPABASE_URL=https://ahlpvlhmpfiyeoercxol.supabase.co
SUPABASE_ANON_KEY=replace_with_project_anon_key
BEBOSS_UNLOCK_SIGNING_SECRET=replace_with_the_same_server_signing_secret
```

Do not commit real credentials or the release keystore. Configure release signing values as CI secrets, build with `./gradlew :app:assembleRelease`, verify the resulting APK signature, and upload the signed APK through Admin → App releases. The public download page uses the private Supabase Storage release object; verify a real APK upload before announcing downloads as production-ready.

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
