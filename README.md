# Telegram Bot Dashboard

A self-hosted web dashboard that logs in as **your Telegram user account**
(over MTProto, the same protocol the Telegram apps use) so it can see,
create, edit and delete every bot you own — all from a UI instead of a
chat with [@BotFather](https://t.me/BotFather).

## What it does

- **Log in with your Telegram account** (phone number + code, with 2FA
  support) instead of the dashboard just trusting a static token.
- **See every bot you own** in one grid: username, name, token (masked,
  revealable), webhook status, monitoring status.
- **See your own account info**: name, username, phone, and your Telegram
  user/chat ID.
- **Create / delete bots** — scripted through @BotFather, since Telegram
  has no direct API for this.
- **Edit settings**: name, description, short description, commands menu,
  webhook.
- **Revoke a token** or **delete a bot entirely** (with typed
  confirmation), both via @BotFather.
- **Monitor messages**: optionally long-polls `getUpdates` for a bot and
  shows a live feed of incoming messages, unique user counts, and lets you
  reply directly.

## How it works

Telegram has two separate APIs, and this dashboard uses both:

| | Bot API (`api.telegram.org`) | MTProto (what Telegram apps use) |
|---|---|---|
| Acts as | one bot | your user account |
| Can list bots you own | no | yes (`bots.getAdminedBots`) |
| Create/delete a bot | no | only via scripting @BotFather |
| Edit name/description/commands/webhook | yes | — |

So the dashboard logs in as your user over MTProto
([teleproto](https://docs.teleproto.dev), a maintained GramJS-compatible
client) to list bots and script @BotFather, and calls the plain Bot API
directly for everything a bot token can do on its own.

**Security note:** the MTProto session string and every bot token are
encrypted at rest (AES-256-GCM, keyed from `APP_SECRET`). Anyone who gets
into the dashboard has full control of your Telegram account and all your
bots — keep `DASHBOARD_PASSWORD` and `APP_SECRET` secret, and don't expose
the port beyond `127.0.0.1` unless you put a reverse proxy with its own
auth/TLS in front of it.

## Setup

1. Get `API_ID` / `API_HASH` from <https://my.telegram.org/apps> (requires
   logging in with the Telegram account you'll use for this dashboard).
2. Copy `.env.example` to `.env` and fill it in:
   ```sh
   cp .env.example .env
   openssl rand -hex 32   # use this for APP_SECRET
   ```
3. Run it:
   ```sh
   docker compose up --build
   ```
4. Open <http://localhost:3000>, enter your dashboard password, then sign
   in with your Telegram phone number and the code sent to your Telegram
   app.

Data (your encrypted session, bot tokens, and monitored messages) persists
in the `tgdash-data` Docker volume across restarts.

## Local development (without Docker)

```sh
npm install
npm run db:migrate   # applies migrations to ./data/app.db
npm run dev
```

## Project layout

- `app/` — Next.js App Router pages and API routes.
- `lib/mtproto.ts` — the MTProto login flow and client singleton.
- `lib/botfather.ts` — scripts @BotFather's chat for create/delete/token
  flows (clicks its inline buttons rather than parsing free text where
  possible).
- `lib/botapi.ts` — a thin wrapper around the Bot API.
- `lib/poller.ts` + `instrumentation.ts` — the background `getUpdates`
  poller for bots with monitoring enabled.
- `lib/db/` — SQLite schema and migrations (Drizzle ORM).

## Known limitations

- @BotFather is a chat bot, not a formal API — the create/delete/token
  flows in `lib/botfather.ts` match its current prompts and inline
  buttons. If Telegram changes BotFather's wording, those flows may need
  updating.
- A bot's updates can go to a webhook *or* to this dashboard's monitor
  poller, never both — setting a webhook disables monitoring for that bot.
- Telegram rate-limits bot creation and BotFather interactions generally.
