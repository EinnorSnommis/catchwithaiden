# CLAUDE.md — Catch With Aiden

Context for Claude Code sessions in this repo. Read before changing anything.

## What this is

A one-page marketing + booking site for **Catch With Aiden** — private catching
lessons taught by Aiden Simmons (Class of 2026 catcher, Southeast Guilford HS,
Greensboro NC, committed to Robeson Community College). Lessons are 30 minutes,
$30, ages 8–15, 1-on-1 only.

- **Live:** https://catchwithaiden.com (HTTPS enforced)
- **Repo:** https://github.com/EinnorSnommis/catchwithaiden
- **Hosting:** GitHub Pages, `main` branch, root. Pushing to `main` publishes.
- **Domain:** Porkbun DNS → four GitHub A records + `www` CNAME. Do not touch
  the MX/SPF records there; they're for Porkbun email forwarding.
- Business email: `catchwithaiden@gmail.com` (owns the Apps Script deployment,
  Calendar, and bookings sheet). Public addresses `schedule@catchwithaiden.com`
  and `questions@catchwithaiden.com` are Porkbun forwards into it. Aiden's
  personal Gmail is deliberately not used anywhere in the business.
- Aiden's phone: (336) 508-2721
- His recruiting page (linked from the site): https://einnorsnommis.github.io/AidenSimmons2026/
- **Two people.** Aiden (18, turns 19 on 2026-08-28) is the business owner — he
  teaches the lessons, holds the Google/payment accounts, and is "the owner" in
  the decisions below. His father Ronnie does the technical build and is who
  Claude sessions normally take direction from. When a decision is about how the
  business runs — pricing, policy, what's on the page — it's Aiden's call.

## Files

| File | Purpose |
|---|---|
| `index.html` | The entire site — embedded CSS + vanilla JS, no build step |
| `Code.gs` | Google Apps Script booking backend (deployed separately, not by Pages) |
| `images/` | `hero.jpg` (Robeson commitment graphic), `about.jpg`, `lesson.jpg` |
| `CNAME` | Custom domain. GitHub itself sometimes rewrites this — don't fight it |
| `publish.ps1` | One-click deploy: stage → commit → sync → push |
| `README.md` | Non-developer setup guide written for Aiden and his family |

## How to publish

```powershell
.\publish.ps1 "what changed"
```

It aborts loudly on failure rather than claiming success. Never push
half-finished work — `main` is live.

## Design system

Source of truth is the original mockup's design language. Dark theme:

- Background `#0b0b0c`, elevated `#131316`, borders `#2a2a30`
- **Robeson CC "Diamond Eagles" palette**, sampled from `images/hero.jpg`
  (the athletics program is new and publishes no brand guide):
  - `--blue #104e89` — RCC blue. **Fills only** — 2.3:1 on the background, so
    it may never carry text, borders, or icons. White text on it is 8.4:1.
  - `--blue-hi #3d8ad4` — the readable-on-dark tint (5.4:1). Everything blue
    that isn't a fill uses this.
  - `--green #5ea23e` / `--green-hi #7ac356` — 6.2:1.
  - `--warn #d99a3c` — caution callouts only. Not a brand color; it exists so
    warnings aren't green.
- Text `#f5f1ea` warm off-white, muted `#7d7972`
- Fonts: Bebas Neue (headlines), Barlow + Barlow Condensed (body/labels),
  DM Mono (small technical text)

## Decisions that must not be silently reverted

These look like mistakes but are deliberate:

1. **Blue = structure, green = action. Never mix the roles.** Blue carries
   navigation, headings, rules, borders and card chrome; green is reserved for
   things a parent acts on — book buttons, available days, selected slots,
   submit, success. This split is deliberate and was Aiden's call, so a green
   heading or a blue Book button is a bug, not a refresh.
   The site was orange `#ff6a1a` (Southeast Guilford jersey) through
   2026-08-08; it moved to Robeson CC's colors when Aiden started college.
   The orange in the hero and about photos is his high-school jersey — that's
   history, not a palette leak, and the photos stay as they are.
2. **No hero stats** (pop time, height, handedness, GPA), **no group clinics**,
   **no video review feature.** All intentionally cut from the spec.
3. **Images are never cropped.** All three photos render at their natural
   aspect ratio — no `object-fit: cover`, no fixed `aspect-ratio` on their
   containers. The owner asked for this specifically.
4. **Zelle / Cash App, not Stripe.** Card processing means ~$1.17 in fees on a
   $30 lesson, and Stripe requires the account holder to be 18. Payment is
   manual and pre-paid by design.
5. **The liability waiver is required.** A parent cannot book without ticking
   it; the backend re-checks and records a timestamp. Don't make it optional.
6. **Booking mail sends From: the Gmail address, not the custom domain.** This
   looks unbranded and is meant to be. Gmail is already a trusted sender; a
   `@catchwithaiden.com` From: sent through Apps Script without aligned
   SPF/DKIM/DMARC gets filtered *harder*, and a parent who never sees the
   payment instructions doesn't pay — the slot then expires in 12 hours. The
   branding is carried by `replyTo` instead (`CONFIG.SCHEDULE_EMAIL` /
   `QUESTIONS_EMAIL` in `Code.gs`), which needs no alias or SMTP. Changing the
   From: means paid mailbox hosting and real DNS work, not a one-line edit.

## Booking architecture

Static page can't hold state, so bookings run through a Google Apps Script web
app deployed from the **`catchwithaiden@gmail.com`** account (so events land on
the business calendar and mail comes from the business Gmail).

Flow is **request → pre-pay → approve**:

1. Parent picks a slot, agrees to the waiver, submits → `POST` to the Apps
   Script (as `text/plain` to dodge CORS preflight — Apps Script can't answer
   `OPTIONS`).
2. Row saved `PENDING` with a single-use UUID token. Parent gets payment
   instructions; slot held 12 hours. Aiden gets CONFIRM/DECLINE links.
3. Aiden sees the Zelle/Cash App notification, taps CONFIRM → calendar event
   created, parent emailed, status `CONFIRMED`.
4. Unpaid requests auto-expire hourly via the `expirePendingBookings` trigger.

The page `GET`s the same URL on load for availability, and never receives any
personal data back — only which slots are taken.

## Outstanding work

- [ ] **Apps Script not deployed yet.** `BOOKING_API_URL` in `index.html` is
      still `REPLACE_WITH_APPS_SCRIPT_DEPLOYMENT_URL`, so the booking section
      shows a friendly "not connected yet" notice and the calendar is
      display-only. README steps 2–3 cover deployment.
- [ ] **Placeholders to replace** once Aiden provides real values:
      `ZELLE_PHONE_PLACEHOLDER` and `$CASHTAG_PLACEHOLDER` in `index.html`
      (cashtag appears twice — text and the cash.app link), plus
      `ZELLE_PHONE`, `CASHTAG`, and `LOCATION` in `Code.gs` CONFIG.
- [ ] Waiver text has not been reviewed by an attorney.

## If the Apps Script backend proves painful

**Cal.com** is the chosen fallback, not Calendly. Cal.com's free plan has
"Requires confirmation" — host approves each booking by email, and pending
bookings can hold the slot — which reproduces this exact flow. It also allows
custom booking questions (the waiver) and a dark-theme embed. **Calendly has no
host-approval step at all**, so parents would be told they're confirmed before
paying; that breaks the whole model.

## Testing locally

There's no build step — open `index.html` directly for layout work. To exercise
the booking flow, run a tiny local server that serves the folder and mocks the
Apps Script API (`GET` returns `{ok, config, taken}`, `POST` returns
`{ok, message}`), then point a copy of the page at it. Two gotchas:

- The page's CSP `connect-src` only allows script.google.com, so a test copy
  needs localhost added.
- Verify at 375px, 768px, and 1200px: no horizontal scroll, tap targets ≥44px,
  and images matching their natural aspect ratio.
