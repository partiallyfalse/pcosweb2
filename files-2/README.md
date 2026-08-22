# Bunny's Corner — setup

Roughly 20 minutes start to finish. Everything below is free tier.

---

## 1. Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, **New project**.
   Pick a region near Michigan (`us-east-1`). Save the database password
   somewhere — you won't need it often, but you can't recover it.
2. Wait for it to finish provisioning (~2 min).

### Run the schema

**SQL Editor** → **New query** → paste all of `schema.sql` → **Run**.

"Success. No rows returned" is what a clean run looks like — those statements
create things, they don't return data.

**If you already ran `schema.sql` before:** run `migration.sql` too. It adds the
one column that photos-in-chat needs.

This creates every table, locks them down with row-level security, makes the
photo storage bucket, and turns on realtime.

### Turn off public signups

**Authentication** → **Sign In / Providers** → **Email** → turn
**Allow new users to sign up** OFF.

This is what makes the site private. Without it, anyone who finds the URL can
create an account and read everything.

### Create the two accounts

**Authentication** → **Users** → **Add user** → **Create new user**.
Do this twice — one for you, one for her. Check **Auto Confirm User** both
times so nobody has to click a verification email.

### Grab your keys

**Project Settings** → **API**. Copy:
- **Project URL**
- **anon / public** key

---

## 2. Fill in the config

Open `index.html`, find this near the top of the `<script>` block:

```js
const SUPABASE_URL      = "PASTE_YOUR_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";
```

Paste both values in.

**These two are safe to commit and deploy.** The anon key is designed to be
public — your data is protected by the row-level security policies in
`schema.sql`, not by hiding this key. Your OpenRouter key is the one that must
never appear here.

---

## 3. Deploy

Put these in a GitHub repo:

```
index.html
netlify.toml
netlify/functions/chat.js
schema.sql        (reference only, not served)
README.md
```

Then [netlify.com](https://netlify.com) → **Add new site** → **Import an
existing project** → pick the repo → Deploy. No build command needed.

> Drag-and-drop deploy won't work here — serverless functions need a real
> deploy. Git is the easy path. (`netlify deploy --prod` via the CLI also works.)

### Environment variables

Netlify → **Site configuration** → **Environment variables** → add:

| Key | Value |
|---|---|
| `OPENROUTER_API_KEY` | your key from openrouter.ai |
| `SUPABASE_URL` | same URL as in index.html |
| `SUPABASE_ANON_KEY` | same anon key as in index.html |
| `SITE_URL` | your deployed URL, e.g. `https://bunnys-corner.netlify.app` |
| `OPENROUTER_MODEL` | optional, defaults to `google/gemini-2.5-flash` |
| `OPENROUTER_STT_MODEL` | optional, defaults to `openai/whisper-1` |

Redeploy after adding them (**Deploys** → **Trigger deploy**).

### Point auth at your real URL

Back in Supabase: **Authentication** → **URL Configuration** → set
**Site URL** to your Netlify URL. Password reset emails break without this.

---

## What runs where

| Thing | Where it lives | Who sees it |
|---|---|---|
| Notes | Supabase `notes` | both of you, live |
| Gift list | Supabase `gifts` | both of you, live |
| Gallery + hero photo | Supabase Storage | both of you, live |
| Tracker entries | Supabase `entries` | **only the person who wrote them** |
| Chat + assistant memory | Supabase `chat` / `memories` | both of you |
| OpenRouter key | Netlify env var | nobody — never sent to the browser |

Notes, gifts, and photos sync without a refresh. The green dot next to your name
in the header means the realtime connection is up.

---

## Photos and voice notes in the chat

The chat bar has two extra buttons.

**Photo** — pick an image, it uploads and gets sent to the model along with
whatever you type. Gemini Flash reads images natively, so you can ask it about
a rash, a supplement label, a lab result, a meal. The photo is saved so it stays
in the history for both of you, and it does *not* show up in the Gallery page.

**Microphone** — tap to record, tap again to stop. The audio goes to Whisper,
comes back as text, and lands in the input box so you can read it before
sending. Two-minute cap per note; "cancel" throws it away without sending.

The mic needs HTTPS, which your Netlify URL gives you automatically. It won't
work if you open `index.html` straight off your desktop, and the browser will
ask permission the first time.

### Why voice goes through Whisper instead of the chat model

OpenRouter's own guidance: use the transcription endpoint when you want audio
turned into text, and audio-input-on-chat when you want the model to reason
about the *sound* — tone, background noise, who's speaking. For voice notes you
want the words. Transcription is cheaper, faster, and accepts the `webm` format
browsers actually record in, which chat audio input is pickier about.

If you ever want the model reasoning about audio directly, that's a different
call — worth knowing the distinction exists.

### Costs

Both are cheap at two-person scale. Gemini Flash is one of the least expensive
vision-capable models on OpenRouter, and Whisper bills per second of audio.
Set a spending cap in the OpenRouter dashboard anyway — it costs nothing and
means a bug can't run up a bill.

---

## Costs

Free tier covers this easily for two people. Supabase free gives 500MB database
and 1GB file storage — that's thousands of photos at the sizes the site
compresses to. OpenRouter is pay-per-use; light chat use runs pennies a month,
and you can set a spending cap in their dashboard.

Supabase pauses free projects after a week of no activity. Opening the site
wakes it back up, but the first load will be slow. If you both use it regularly
this won't come up.

---

## Changing things

**The PCOS content** is in `app.js` inside `index.html` — the `SYMPTOMS` and
`KNOW` arrays. Plain text, edit freely. **Read it before she does.** It's
medically grounded but generic, and you know her situation.

**Her name** — the `HER_NAME` constant, plus the heading in the home section.

**The assistant's personality** — the `systemPrompt()` function.

**Colors** — the `:root` block at the top of the CSS. Everything derives from
those six variables.

---

## Honest notes

- Real auth now: passwords are hashed by Supabase, sessions are real tokens, and
  the chat endpoint rejects anyone who isn't signed in. This is genuinely
  private in a way the previous version wasn't.
- Tracker entries are enforced private at the *database* level, not just hidden
  in the UI. Even if someone got the other account, they couldn't read them.
- Anyone signed in can delete any shared note, gift, or photo. That's deliberate
  for two people who trust each other; there's no undo.
- The assistant can talk about PCOS generally but is instructed not to diagnose
  and to point at a real doctor for anything specific. Don't let it replace one.
