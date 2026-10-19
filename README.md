# Telegram Bot Dashboard

A private website that lets you manage all your Telegram bots from one
place, instead of messaging @BotFather every time. You sign in with your
own Telegram account, and you'll only ever see your own bots. More than one
person can use the same dashboard, each seeing only what belongs to them.

## What it does

- **Sign in with your Telegram account** (phone number and the code
  Telegram sends you).
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

Your account's secret login info and your bots' secret codes are stored
in a locked (encrypted) form, not as plain text. Anyone who can sign in to
the dashboard has full control over their own account and bots through
it — so keep your dashboard password and setup secret safe, and don't make
the dashboard reachable from the open internet unless you've added your
own extra layer of protection in front of it.

## Setting it up

1. Get your app credentials from Telegram's website (you'll need to log
   in with the Telegram account you plan to use with this dashboard).
2. Copy the example settings file to a real settings file and fill in the
   values it asks for. For trying it out, you can set the dashboard
   password to `admin123` — just change it to something private before
   using this for real.
3. Start it up with one command.
4. Open the dashboard in your browser, type in the dashboard password,
   then sign in with your phone number and the code Telegram sends you.

Everything you set up (your login, your bots, their messages) is saved and
will still be there the next time you start the dashboard.

## Multiple people using it

Anyone who knows the dashboard password can sign in with their own
Telegram account. Once signed in, a person only ever sees, edits, or
deletes their own bots — never anyone else's.

A couple of things worth knowing:

- **Treat the dashboard password like an invite code.** Anyone who has it
  can sign in with their own Telegram account. If you want to control
  exactly *which* Telegram accounts are allowed in, you can set up an
  allow-list. If someone isn't on the list, they'll see their own Telegram
  ID so they can ask you to add them.
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
