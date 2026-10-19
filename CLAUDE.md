# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

This is Next.js 16 / React 19 / Tailwind 4. Notably, request middleware lives in `proxy.ts` (exporting `proxy`), not `middleware.ts`. Check `node_modules/next/dist/docs/` before using any Next.js API from memory.

## Commands

```sh
npm run dev           # dev server on :3000
npm run build         # production build (output: "standalone")
npm run lint          # eslint .
npx tsc --noEmit      # type-check (no dedicated script)
npm run db:generate   # generate a Drizzle migration after editing lib/db/schema.ts
npm run db:migrate    # apply migrations to DATABASE_PATH (default ./data/app.db)
docker compose up --build
```

There is no test suite. Required env vars are in `.env.example` (`API_ID`, `API_HASH`, `APP_SECRET`; optional `REGISTRATION_ENABLED`, `ALLOWED_TELEGRAM_USER_IDS`, `DATABASE_PATH`, `HOST_BIND`, `TRUSTED_PROXY_HOPS`).

## What this is

A self-hosted dashboard, signed into by **scanning a QR code with Telegram** (no dashboard password), where each dashboard account can link multiple **Telegram user accounts over MTProto** (via `teleproto`, a GramJS-compatible client) to list/create/delete their bots and manage their channels/groups, and calls the plain **Bot API** with each bot's token for everything a token can do itself (name, descriptions, commands, webhook, messages). Bot creation/deletion/token fetch/revoke have no API, so `lib/botfather.ts` scripts a chat with @BotFather (clicking its inline buttons where possible). If BotFather's wording changes, those flows break.

## Architecture

**Two identities, one cookie** (`lib/auth.ts`): a dashboard account (`users` table — `username` is just a display name copied from Telegram at creation, not a credential) can link multiple Telegram accounts (`telegram_accounts` table, one row per linked account, `ownerUserId` → `users.id`). The single `tgdash_session` JWT cookie carries all three: `sub` (dashboard user ID), `ver` (that user's `sessionVersion`, bumped by "sign out other browsers" in Settings to invalidate other devices), and `activeTelegramAccountId` (which linked account bot/chat routes act as — re-signed whenever the user switches accounts, never a second cookie). `proxy.ts` redirects unauthenticated *page* requests to `/login` but lets all `/api/*` through — API routes enforce auth themselves (`lib/api-guard.ts`):
- `withSession` — routes that need the dashboard user but not a specific Telegram account (account management, `/api/me`, logout, the link-account wizard). Passes `userId` as the third handler arg.
- `withAuth` — every bot/chat route. Re-validates `activeTelegramAccountId` against the DB every request (catches an account unbound in another tab) and 409s with `code: "NO_ACTIVE_ACCOUNT"` if none is set; passes the Telegram account's `id` as the third handler arg `(req, ctx, telegramAccountId)`. Dynamic params are `await ctx.params`.
- `withRateLimit` — wraps starting a sign-in QR (`POST /api/login/qr`) and the sign-in 2FA step (`/api/login/password`), per-IP since there's no dashboard user yet. Polling (`GET /api/login/qr`, every 2s) is intentionally unlimited.

**Sign-in is the same QR/2FA flow as linking, in two modes** (`lib/mtproto.ts`): `startQrLogin(mode, ownerUserId?)` / `pollQrLogin` / `submitLoginPassword` take `mode: "link" | "signin"`. `"link"` (used by `/api/auth/qr`+`/api/auth/password`, `withSession`) binds an extra account to the caller's existing `ownerUserId`. `"signin"` (used by the unauthenticated `/api/login/qr`+`/api/login/password`) has no caller yet — `finishLogin` resolves the dashboard user itself: an existing owner for that `telegramId` signs in as them; otherwise a new `users` row is created (`createUserForTelegram`, `lib/users.ts`), unless `REGISTRATION_ENABLED=false` yields `{ status: "registration_closed" }`. Either mode's `{ status: "logged_in" }` outcome now carries `userId`. Both route pairs share the HTTP mapping of outcomes → responses in `lib/login-response.ts` and the `QrLogin` component (`components/qr-login.tsx`, `apiBase` prop picks `/api/login` vs `/api/auth`). A sign-in or re-link also best-effort logs out that Telegram account's previous session (`endPreviousSession`) so Telegram's Devices list keeps one dashboard entry per account.

**Multi-tenant isolation is enforced by query scoping, not by the DB.** Every lookup in `lib/bots.ts` / `lib/chats.ts` takes `ownerUserId`, which is actually a `telegram_accounts.id` (bots/chats belong to a linked Telegram account, not directly to the dashboard user) — e.g. `getBotById(id, telegramAccountId)`. Any new data access must be scoped the same way. A Telegram account's `telegramId` is globally unique across `telegram_accounts` (enforced by a unique index) since the live MTProto client map is keyed by it — two dashboard users can never link the same Telegram account.

**Revoked Telegram sessions**: `getClient` wraps each client's `invoke` so any MTProto 401 (session terminated from the phone, etc.) sets `telegram_accounts.revokedAt` and throws `TelegramSessionRevokedError`, which `errorResponse`/`withAuth` turn into 409 `code: "SESSION_REVOKED"`. `GET /api/telegram-accounts` also probes live sessions (TTL-cached) and re-points the cookie off a revoked active account. Revoked rows keep their bots/chats; signing in or re-linking by QR clears `revokedAt`. On the client, `AccountsProvider` (`app/(dashboard)/accounts-context.tsx`) is the single account list — refreshes on focus/interval/`SESSION_REVOKED` and remounts the page when the active account changes.

**Secrets at rest**: MTProto session strings and bot tokens are AES-256-GCM encrypted with a key derived from `APP_SECRET` (`lib/crypto.ts`). Always go through `encrypt`/`decrypt`; use `maskSecret` when returning tokens in list views. There's no dashboard password to hash — Telegram's own auth (and 2FA, if the account has it) is the only credential check.

**Process-global state on `globalThis`** (survives dev hot-reload and module re-evaluation): the SQLite/Drizzle handle (`lib/db/index.ts`), per-account MTProto clients keyed by Telegram ID and in-progress login states (`lib/mtproto.ts`), and in-flight promise map (`lib/single-flight.ts`). Follow the `globalThis.__tgDash*` pattern for any new process-wide state. The app assumes a single Node process.

**Concurrency guards around BotFather / MTProto**:
- `lib/botfather.ts` holds a per-user lock so two flows never interleave in the same BotFather chat.
- `singleFlight(key, fn)` collapses duplicate concurrent calls (repeat clicks, parallel requests) into one promise — used for token healing, chat sync, invite regeneration, deletes.

**Token self-healing**: wrap Bot API calls in `withLiveBotToken(bot, userId, fn)` (`lib/bots.ts`). On a 401 it re-fetches the token from BotFather, saves it, and retries once (single-flighted, with a cooldown so a still-dead token doesn't reopen BotFather on every request).

**Background poller**: `instrumentation.ts` starts `lib/poller.ts` once per Node process; it long-polls `getUpdates` for every bot with `monitorEnabled`, storing into `bot_messages` / `bot_users` and advancing `lastUpdateId`. A webhook and monitoring are mutually exclusive for a bot.

**Chats** (`lib/chats.ts`, `chats` table): a local mirror of channels/groups the user owns/admins, synced from dialogs. It mainly exists to persist each channel's `accessHash`, which MTProto channel calls need and the session string doesn't keep. Use `botApiChatId()` to convert to Bot API chat IDs.

**Frontend**: `app/(dashboard)/` pages are client components that call the JSON API via `apiFetch` (`lib/api-client.ts`, throws `ApiError`). Overview (`/`) is about the active account (profile, photo via `/api/me/photo`, counts + recent bot messages from `/api/overview`, which reads only the local DB); bots and channels/groups have their own list pages (`/bots`, `/chats`) with search + filter chips (`list-toolbar.tsx`, filter kept in `?filter=`). Pages that need an active account render `NoActiveAccount` (`no-active-account.tsx`) on `NO_ACTIVE_ACCOUNT`/`SESSION_REVOKED`. Bot/chat detail pages are split into `*-tab.tsx` components with shared types in a sibling `types.ts`. UI primitives are shadcn-style in `components/ui/`; toasts via `sonner`. `lib/validation.ts` validators return an error string or `null` and are shared between client forms and API routes.

**Database**: SQLite via `better-sqlite3` + Drizzle (sync API: `.all()`, `.run()`). Both `better-sqlite3` and `teleproto` are `serverExternalPackages`. Migrations live in `lib/db/migrations/`; the Docker image runs them at startup with `scripts/migrate.cjs` (plain JS copy of `lib/db/migrate.ts` — keep the two in sync).
