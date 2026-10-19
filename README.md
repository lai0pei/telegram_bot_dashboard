# Telegram Bot Dashboard

A private website that lets you manage all your Telegram bots from one
place, instead of messaging @BotFather every time. Sign in by scanning a QR
code with your Telegram app — no separate dashboard password to create or
remember. You'll only ever see bots and channels belonging to whichever
Telegram account you have active, and you can link more than one Telegram
account to the same dashboard account. More than one person can use the
same dashboard, each seeing only what belongs to them.

## What it does

- **Sign in by scanning a QR code** with the Telegram app on your phone —
  the first time you sign in with a Telegram account, a dashboard account is
  created for you automatically. **Link more Telegram accounts** the same
  way and switch between them from the sidebar at any time.
- **See all your bots** in one place: name, username, token, whether it
  has notifications set up.
- **See your own account info**: your name, username, and phone number.
- **Create or delete a bot** right from the dashboard.
- **Edit a bot's settings**: its name, descriptions, menu of commands, and
  notification settings.
- **Reset a bot's secret code** or **delete a bot** (with a confirmation
  step so it doesn't happen by accident).
- **Watch a bot's messages live**: see incoming messages, how many people
  have used it, and reply directly from the dashboard.

## Keeping things safe

Your linked Telegram accounts' secret login info and your bots' secret
codes are stored in a locked (encrypted) form, not as plain text. There's no
dashboard password to leak or brute-force — signing in requires scanning a
QR code with the real Telegram app on your phone, which only you can do.
Anyone who can scan that code has full control over the Telegram accounts
and bots linked to that dashboard account — so treat your phone's Telegram
app the same way you'd treat a password, and don't make the dashboard
reachable from the open internet unless you've added your own extra layer
of protection in front of it.

## Setting it up

1. Get your app credentials from Telegram's website.
2. Copy the example settings file to a real settings file and fill in the
   values it asks for.
3. Start it up with one command.
4. Open the dashboard in your browser and sign in by scanning the QR code
   with the Telegram app (Settings → Devices → Link Desktop Device). The
   first Telegram account to sign in becomes your first dashboard account.

Everything you set up (your dashboard account, linked Telegram accounts,
your bots, their messages) is saved and will still be there the next time
you start the dashboard.

## Multiple people using it

By default, anyone who signs in with an unrecognized Telegram account gets
their own new dashboard account automatically. Each dashboard account only
ever sees, edits, or deletes bots and channels belonging to the Telegram
accounts linked to *that* account — never anyone else's.

A couple of things worth knowing:

- **You can close sign-ups once you've made your own account**, by setting
  `REGISTRATION_ENABLED=false`. An unrecognized Telegram account can then no
  longer create a dashboard account by signing in — an admin has to link it
  to an existing account first (from that account, via "Link Telegram
  account"). Already-linked accounts keep working.
- **You can control exactly which Telegram accounts are allowed to be
  linked** with an allow-list. If a Telegram account isn't on the list,
  its Telegram ID is shown so its owner can ask you to add it.
- **Whoever runs the dashboard can see everyone's secrets.** The person
  hosting it holds the key that can unlock everyone's stored login info
  and bot codes. Only share a dashboard with people you trust that much.

Making the dashboard reachable from outside your own computer or network
is optional and up to you — just make sure you add proper protection
first if you do.

## Known limits

- Creating and deleting bots works by automatically chatting with
  @BotFather behind the scenes, since Telegram doesn't offer a direct way
  to do this. If Telegram changes how @BotFather talks, these features
  might need fixing.
- A bot can either send its messages to this dashboard for live
  monitoring, or to an outside service (a "webhook") — not both at once.
- Telegram limits how often you can create bots or talk to @BotFather, so
  doing these things too quickly may get temporarily blocked.
