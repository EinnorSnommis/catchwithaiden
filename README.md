# Catch With Aiden — catchwithaiden.com

Everything you need to put the site live and take bookings. No coding required — just follow the steps in order.

**What's in this folder**

| File | What it is |
|---|---|
| `index.html` | The whole website (design, booking calendar, payment info, FAQ) |
| `images/` | The three photos the site uses |
| `CNAME` | Tells GitHub Pages the site lives at catchwithaiden.com |
| `Code.gs` | The booking backend — gets pasted into Google Apps Script (step 2) |
| `README.md` | This guide |

**How a booking works (the big picture)**

1. A parent picks a date and time on the site and submits the form.
2. The parent instantly gets an email: *"send $30 by Zelle or Cash App — your slot is held for 12 hours."*
3. Aiden gets an email with the request and two buttons: **CONFIRM** and **DECLINE**.
4. Aiden waits for the Zelle/Cash App payment notification on his phone. When it arrives, he taps **CONFIRM**.
5. The lesson appears on Aiden's Google Calendar, and the parent gets a confirmation email with the location and what to bring.
6. If no payment arrives, the request expires by itself after 12 hours and the slot opens back up.

---

## Step 1 — Put the website on GitHub Pages

1. Go to [github.com](https://github.com) and sign in (create a free account if needed).
2. Click **+** (top right) → **New repository**. Name it `catchwithaiden`, keep it **Public**, click **Create repository**.
3. On the new repo page, click **uploading an existing file**, drag in `index.html`, `CNAME`, `README.md`, and the whole `images` folder, then click **Commit changes**.
4. Go to **Settings → Pages** (left sidebar).
5. Under **Build and deployment → Source**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Click **Save**.
6. Wait a minute or two — the page will show your site's URL when it's live.

### Connect the catchwithaiden.com domain

1. Still in **Settings → Pages**, under **Custom domain**, type `catchwithaiden.com` and click **Save**.
2. At your domain registrar (wherever catchwithaiden.com was purchased), open the DNS settings and add:
   - Four **A records**, each with host/name `@`, pointing to:
     - `185.199.108.153`
     - `185.199.109.153`
     - `185.199.110.153`
     - `185.199.111.153`
   - One **CNAME record** with host/name `www` pointing to `einnorsnommis.github.io`
     *(if the GitHub account username is different, use `YOUR-USERNAME.github.io`)*
3. DNS can take from a few minutes up to a day to kick in. Come back to **Settings → Pages** and once the domain check passes, **tick "Enforce HTTPS."** Don't skip this — it keeps the booking form secure.

---

## Step 2 — Deploy the booking backend (from Aiden's Google account)

This must be done while signed in as **aidenjsimmons1@gmail.com** — that's whose Calendar and Gmail the bookings flow through.

1. Go to [script.google.com](https://script.google.com) and sign in as Aiden.
2. Click **+ New project**.
3. Delete the empty code in the editor and paste in the entire contents of `Code.gs` (open it in Notepad, Select All, Copy, Paste).
4. **Before deploying, replace the placeholders** near the top of the file (see "Placeholders" below).
5. Click the 💾 save icon, then **Deploy → New deployment**.
6. Click the ⚙️ gear next to "Select type" → choose **Web app**.
7. Set:
   - **Execute as:** Me (aidenjsimmons1@gmail.com)
   - **Who has access:** Anyone
8. Click **Deploy**. Google will ask for permission — click **Authorize access**, pick Aiden's account, click **Advanced → Go to (project name)** if it warns you, and **Allow**. (The warning appears because it's your own personal script, not a published app.)
9. Copy the **Web app URL** it gives you (it starts with `https://script.google.com/macros/s/...`).

### Paste the URL into the website

1. Open `index.html` in Notepad (or edit it directly on GitHub: open the file → pencil icon).
2. Find this line near the bottom (there's a big warning comment above it):
   ```
   const BOOKING_API_URL = "REPLACE_WITH_APPS_SCRIPT_DEPLOYMENT_URL";
   ```
3. Replace the placeholder with the Web app URL, keeping the quotes:
   ```
   const BOOKING_API_URL = "https://script.google.com/macros/s/XXXXX/exec";
   ```
4. Save / commit the change. Reload catchwithaiden.com — the calendar now shows live availability.

---

## Step 3 — Turn on the 12-hour auto-expire

This frees up slots when someone requests but never pays.

1. In the Apps Script editor, click the ⏰ **Triggers** icon (left sidebar).
2. Click **+ Add Trigger** (bottom right) and set:
   - Function: **expirePendingBookings**
   - Event source: **Time-driven**
   - Type: **Hour timer**
   - Interval: **Every hour**
3. Click **Save** (authorize again if asked).

---

## Placeholders you must replace before going live

In **`Code.gs`** (top of the file, in the `CONFIG` block):

| Placeholder | Replace with |
|---|---|
| `ZELLE_PHONE_PLACEHOLDER` | The phone number linked to Aiden's Zelle, e.g. `(336) 555-1234` |
| `CASHTAG_PLACEHOLDER` | Aiden's cashtag **without** the `$`, e.g. `AidenSimmons` |
| `LOCATION_PLACEHOLDER…` | Where lessons happen (goes in confirmation emails) |
| `PRICE: 30` | Change if the price changes |

In **`index.html`**:

| Placeholder | Where | Replace with |
|---|---|---|
| `ZELLE_PHONE_PLACEHOLDER` | Payment section | Same Zelle number |
| `$CASHTAG_PLACEHOLDER` | Payment section (appears **twice** — the card text and the "Pay on Cash App" link) | `$AidenSimmons` in the text, and `https://cash.app/$AidenSimmons` in the link |
| `$30` price | Pricing card + payment steps | Only if the price changes |

---

## Changing available days and hours

Open the Apps Script project, edit the `CONFIG` block at the top of the code, and change:

```
DAYS_OF_WEEK: [0, 6],   // 0=Sunday, 1=Monday … 6=Saturday.  [0,3,6] = Sun+Wed+Sat
START_HOUR: 9,          // first lesson can start 9:00 AM
END_HOUR: 18,           // last lesson must END by 6:00 PM
WEEKS_AHEAD: 3,         // how far ahead parents can book
```

Click 💾 save, then **Deploy → Manage deployments → ✏️ edit → Version: New version → Deploy**. (Just saving isn't enough — the web app serves the deployed version.) The URL stays the same, so the website needs no changes.

---

## Where the bookings live

The first booking automatically creates a Google Sheet called **"Catch With Aiden — Bookings"** in Aiden's Google Drive ([drive.google.com](https://drive.google.com) → search for it). Every request is a row:

- **status** — `PENDING` (waiting on payment), `CONFIRMED` (paid & on the calendar), `DECLINED`, or `EXPIRED` (never paid, slot released)
- Parent/player names, age, phone, email, date, time

You never need to edit the Sheet — it's the record book. But it's handy for looking up a parent's number.

## Aiden's day-to-day

1. 📧 Request email arrives: *"New lesson request: Mason — Saturday, July 18 at 9:00 AM."*
2. 💵 Wait for the Zelle / Cash App notification for $30 with the player's name in the note.
3. ✅ Tap **CONFIRM (paid)** in the email. Done — the event is on the calendar and the parent is notified.
4. ❌ Wrong slot / can't make it? Tap **DECLINE** and the parent is notified politely.
5. 🕐 No payment? Do nothing. It expires after 12 hours on its own.

## If something breaks

- **Calendar shows "Couldn't load live availability"** — the `BOOKING_API_URL` in `index.html` is missing, wrong, or the Apps Script deployment was deleted. Redo the end of Step 2.
- **Changed CONFIG but the site didn't update** — you saved but didn't create a **new deployment version** (see "Changing available days and hours").
- **Emails not arriving** — check Spam. Gmail limits personal accounts to ~100 emails/day through Apps Script, which is far more than a lesson business needs.
- **Backup plan** — if Apps Script ever feels flaky, a Google Calendar *Appointment Schedule* embed can replace the booking section (free, syncs the same way, but looks like Google instead of the site).
