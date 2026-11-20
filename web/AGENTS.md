<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## BeBoss architecture

- The Android app (Kotlin, offline-first) talks directly to the Cloud REST API with the publishable key plus an `X-Shop-Sync-Key` tenant header; keep table/column names compatible with `SupabaseAdminClient.kt`, because renaming breaks shipped APKs.
- BB2 unlock codes must stay byte-identical to `SubscriptionSecurityManager.kt` (`src/lib/bb2.ts`); the signing key is read only server-side (env or service-role-only `app_secrets`), never returned to the browser.
- Subscription math lives in `src/lib/pricing.ts` and is mirrored by a database trigger that recomputes payment amounts server-side; change both together so clients cannot underpay.
- Admin mutations go through `*.functions.ts` server functions that re-check `user_roles` (admin vs support, see `src/lib/admin-guard.server.ts`) and write an audit row; never mutate admin data from the browser client directly.
- APKs live in a private `releases` bucket; the public stable link is `/api/public/download/latest`, which signs a short-lived URL and counts the download.
- Public site copy is translated in `src/lib/i18n-dict.ts` (EN/RW/FR/SW) and FAQ in `src/components/site/faq-content.ts`; add every new public string in all four languages.
- Branch snapshots (`BBSHARE1:<sig>:<base64 gzip JSON>`) are decoded server-side only in `src/lib/snapshot-analytics.ts`; formulas mirror the app's `AnalyticsEngine.kt`, so keep them in sync and covered by its tests.
- AI features (copilot, inbox drafts) call Lovable AI from `src/lib/ai-gateway.server.ts` with a numbers-only business digest; never send customer phone numbers to the model.
- Public platform stats come only from the aggregate `public_platform_stats()` database function; never expose per-shop data on public pages.
