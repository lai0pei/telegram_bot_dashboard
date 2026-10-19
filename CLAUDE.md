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

There is no test suite. Required env vars are in `.env.example` (`API_ID`, `API_HASH`, `APP_SECRET`, `DASHBOARD_PASSWORD`; optional `ALLOWED_TELEGRAM_USER_IDS`, `DATABASE_PATH`, `HOST_BIND`).

## What this is

A self-hosted dashboard that logs in as the user's **Telegram user account over MTProto** (via `teleproto`, a GramJS-compatible client) to list/create/delete their bots and manage their channels/groups, and calls the plain **Bot API** with each bot's token for everything a token can do itself (name, descriptions, commands, webhook, messages). Bot creation/deletion/token fetch/revoke have no API, so `lib/botfather.ts` scripts a chat with @BotFather (clicking its inline buttons where possible). If BotFather's wording changes, those flows break.

## Architecture

**Auth is two-stage, two cookies** (`lib/auth.ts`): the shared `DASHBOARD_PASSWORD` sets a short-lived gate cookie that only unlocks `/api/auth/*` (phone → code → 2FA); completing Telegram login sets a 30-day JWT session cookie whose `sub` is the Telegram user ID. `proxy.ts` redirects unauthenticated *page* requests to `/login` but lets all `/api/*` through — API routes enforce auth themselves:
- `withGate` (`lib/api-guard.ts`) — login-flow routes; rate-limited by IP.
- `withAuth` — every other route; passes `userId` as the third handler arg `(req, ctx, userId)`. Dynamic params are `await ctx.params`.

**Multi-user isolation is enforced by query scoping, not by the DB.** Every lookup in `lib/bots.ts` / `lib/chats.ts` takes `ownerUserId` (e.g. `getBotById(id, userId)`). Any new data access must be scoped the same way.

**Secrets at rest**: MTProto session strings and bot tokens are AES-256-GCM encrypted with a key derived from `APP_SECRET` (`lib/crypto.ts`). Always go through `encrypt`/`decrypt`; use `maskSecret` when returning tokens in list views.

**Process-global state on `globalThis`** (survives dev hot-reload and module re-evaluation): the SQLite/Drizzle handle (`lib/db/index.ts`), per-user MTProto clients and in-progress login states (`lib/mtproto.ts`), and in-flight promise map (`lib/single-flight.ts`). Follow the `globalThis.__tgDash*` pattern for any new process-wide state. The app assumes a single Node process.

**Concurrency guards around BotFather / MTProto**:
- `lib/botfather.ts` holds a per-user lock so two flows never interleave in the same BotFather chat.
- `singleFlight(key, fn)` collapses duplicate concurrent calls (repeat clicks, parallel requests) into one promise — used for token healing, chat sync, invite regeneration, deletes.

**Token self-healing**: wrap Bot API calls in `withLiveBotToken(bot, userId, fn)` (`lib/bots.ts`). On a 401 it re-fetches the token from BotFather, saves it, and retries once (single-flighted, with a cooldown so a still-dead token doesn't reopen BotFather on every request).

**Background poller**: `instrumentation.ts` starts `lib/poller.ts` once per Node process; it long-polls `getUpdates` for every bot with `monitorEnabled`, storing into `bot_messages` / `bot_users` and advancing `lastUpdateId`. A webhook and monitoring are mutually exclusive for a bot.

**Chats** (`lib/chats.ts`, `chats` table): a local mirror of channels/groups the user owns/admins, synced from dialogs. It mainly exists to persist each channel's `accessHash`, which MTProto channel calls need and the session string doesn't keep. Use `botApiChatId()` to convert to Bot API chat IDs.

**Frontend**: `app/(dashboard)/` pages are client components that call the JSON API via `apiFetch` (`lib/api-client.ts`, throws `ApiError`). Bot/chat detail pages are split into `*-tab.tsx` components with shared types in a sibling `types.ts`. UI primitives are shadcn-style in `components/ui/`; toasts via `sonner`. `lib/validation.ts` validators return an error string or `null` and are shared between client forms and API routes.

**Database**: SQLite via `better-sqlite3` + Drizzle (sync API: `.all()`, `.run()`). Both `better-sqlite3` and `teleproto` are `serverExternalPackages`. Migrations live in `lib/db/migrations/`; the Docker image runs them at startup with `scripts/migrate.cjs` (plain JS copy of `lib/db/migrate.ts` — keep the two in sync).
