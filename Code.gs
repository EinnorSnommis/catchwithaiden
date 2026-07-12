/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CATCH WITH AIDEN — Booking backend (Google Apps Script)
 *
 *  Deploy from Aiden's Google account (aidenjsimmons1@gmail.com):
 *    script.google.com → New project → paste this file → Deploy →
 *    New deployment → Web app → Execute as "Me", access "Anyone" →
 *    copy the URL into BOOKING_API_URL in index.html.
 *
 *  Workflow: request → pre-pay → approve.
 *    1. Parent requests a slot on the website  → row saved as PENDING,
 *       parent gets payment instructions, Aiden gets CONFIRM/DECLINE links.
 *    2. Parent pays by Zelle / Cash App within 12 hours.
 *    3. Aiden sees the payment notification and taps CONFIRM →
 *       calendar event created, parent gets a confirmation email.
 *    Pending requests older than 12 h are auto-expired by a time trigger
 *    (set up an hourly trigger on expirePendingBookings — see README).
 * ═══════════════════════════════════════════════════════════════════════════
 */

var CONFIG = {
  // ── Lesson windows: change these to change when lessons are offered ──
  DAYS_OF_WEEK: [0, 6],        // 0=Sunday, 1=Monday … 6=Saturday
  START_HOUR: 9,               // first slot starts 9:00 AM
  END_HOUR: 18,                // last slot ends by 6:00 PM
  SLOT_MINUTES: 30,
  WEEKS_AHEAD: 3,              // how far out parents can book

  // ── Money: replace the placeholders before going live ──
  PRICE: 30,                                    // dollars per lesson
  ZELLE_PHONE: 'ZELLE_PHONE_PLACEHOLDER',       // e.g. '(336) 555-1234'
  CASHTAG: 'CASHTAG_PLACEHOLDER',               // WITHOUT the $ , e.g. 'AidenSimmons'

  // ── Lesson details for the confirmation email ──
  LOCATION: 'LOCATION_PLACEHOLDER (field / cage address, Greensboro NC)',
  WHAT_TO_BRING: "Catcher's gear if you have it, glove, cleats or turf shoes, and water.",

  // ── Plumbing (usually leave alone) ──
  AIDEN_EMAIL: Session.getEffectiveUser().getEmail(),
  TIMEZONE: 'America/New_York',
  HOLD_HOURS: 12,
  SPREADSHEET_NAME: 'Catch With Aiden — Bookings',
  MAX_PER_EMAIL_PER_HOUR: 3,
  MAX_TOTAL_PER_HOUR: 20
};

var SHEET_HEADERS = ['id', 'timestamp', 'status', 'parent', 'player', 'age', 'phone', 'email', 'date', 'time', 'token'];
var COL = { ID: 1, TIMESTAMP: 2, STATUS: 3, PARENT: 4, PLAYER: 5, AGE: 6, PHONE: 7, EMAIL: 8, DATE: 9, TIME: 10, TOKEN: 11 };

/* ═══════════════ ENTRY POINTS ═══════════════ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action) return handleAction_(p);
  return jsonOut_({ ok: true, config: publicConfig_(), taken: takenSlots_() });
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Bad request.' });
  }

  // Honeypot: bots fill the hidden "website" field. Silently pretend success.
  if (data.website) return jsonOut_({ ok: true, message: 'Request received.' });

  // ── sanitize + validate ──
  var parent = clean_(data.parent, 100);
  var player = clean_(data.player, 100);
  var age    = clean_(data.age, 3);
  var phone  = clean_(data.phone, 20);
  var email  = clean_(data.email, 100).toLowerCase();
  var date   = clean_(data.date, 10);
  var time   = clean_(data.time, 5);

  if (!parent || !player) return jsonOut_({ ok: false, error: 'Please include both names.' });
  var ageN = parseInt(age, 10);
  if (!ageN || ageN < 5 || ageN > 18) return jsonOut_({ ok: false, error: 'Player age should be 5–18.' });
  var digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return jsonOut_({ ok: false, error: 'That phone number does not look right.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return jsonOut_({ ok: false, error: 'That email does not look right.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return jsonOut_({ ok: false, error: 'Bad date or time.' });
  }
  if (!isOfferedSlot_(date, time)) {
    return jsonOut_({ ok: false, error: 'That time is not an offered lesson slot. Refresh the page and pick again.' });
  }

  // ── rate limiting ──
  var rl = rateLimit_(email);
  if (rl) return jsonOut_({ ok: false, error: rl });

  // ── write inside a lock so two people can't grab the same slot ──
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Booking is busy right now — please try again in a minute.' });
  }

  try {
    if (slotTaken_(date, time)) {
      return jsonOut_({ ok: false, error: 'Sorry — that slot was just taken. Pick another time.' });
    }
    var id = Utilities.getUuid();
    var token = Utilities.getUuid();
    sheet_().appendRow([id, new Date(), 'PENDING', parent, player, ageN, phone, email, date, time, token]);

    sendParentRequestEmail_(email, parent, player, date, time);
    sendAidenRequestEmail_(id, token, parent, player, ageN, phone, email, date, time);

    return jsonOut_({ ok: true, message: 'Request received — check your email for payment instructions.' });
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Something went wrong saving your request. Text Aiden at (336) 508-2721.' });
  } finally {
    lock.releaseLock();
  }
}

/* ═══════════════ APPROVE / DECLINE (one-tap links in Aiden's email) ═══════════════ */

function handleAction_(p) {
  var action = String(p.action || '');
  var id = String(p.id || '');
  var token = String(p.token || '');
  if ((action !== 'approve' && action !== 'decline') || !id || !token) {
    return htmlPage_('✕', 'Invalid link', 'This link is missing information.');
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return htmlPage_('✕', 'Busy', 'Try tapping the link again in a minute.');
  }

  try {
    var sh = sheet_();
    var values = sh.getDataRange().getValues();
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][COL.ID - 1]) === id) {
        var status = String(values[r][COL.STATUS - 1]);
        var rowToken = String(values[r][COL.TOKEN - 1]);
        if (rowToken !== token) return htmlPage_('✕', 'Invalid link', 'This link is not valid for this booking.');
        if (status !== 'PENDING') {
          return htmlPage_('✓', 'Already handled', 'This booking is already ' + status.toLowerCase() + '. Nothing else to do.');
        }

        var row = r + 1;
        var parent = String(values[r][COL.PARENT - 1]);
        var player = String(values[r][COL.PLAYER - 1]);
        var phone  = String(values[r][COL.PHONE - 1]);
        var email  = String(values[r][COL.EMAIL - 1]);
        var date   = normDate_(values[r][COL.DATE - 1]);
        var time   = normTime_(values[r][COL.TIME - 1]);

        // Tokens are single-use: consume it before doing anything else.
        sh.getRange(row, COL.TOKEN).setValue('USED ' + new Date().toISOString());

        if (action === 'approve') {
          createCalendarEvent_(player, parent, phone, email, date, time);
          sh.getRange(row, COL.STATUS).setValue('CONFIRMED');
          sendParentConfirmedEmail_(email, parent, player, date, time);
          return htmlPage_('✓', 'Done ✔ Confirmed', prettyDateTime_(date, time) + ' — ' + player + '. The event is on your calendar and the parent has been emailed.');
        } else {
          sh.getRange(row, COL.STATUS).setValue('DECLINED');
          sendParentDeclinedEmail_(email, parent, player, date, time);
          return htmlPage_('✓', 'Done ✔ Declined', 'The slot is free again and the parent has been emailed.');
        }
      }
    }
    return htmlPage_('✕', 'Not found', 'No booking matches this link.');
  } finally {
    lock.releaseLock();
  }
}

/* ═══════════════ AUTO-EXPIRE (attach an hourly time trigger to this) ═══════════════ */

function expirePendingBookings() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return; }
  try {
    var sh = sheet_();
    var values = sh.getDataRange().getValues();
    var cutoff = new Date(Date.now() - CONFIG.HOLD_HOURS * 3600 * 1000);
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][COL.STATUS - 1]) === 'PENDING') {
        var ts = new Date(values[r][COL.TIMESTAMP - 1]);
        if (ts < cutoff) {
          sh.getRange(r + 1, COL.STATUS).setValue('EXPIRED');
          sh.getRange(r + 1, COL.TOKEN).setValue('EXPIRED');
        }
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/* ═══════════════ AVAILABILITY ═══════════════ */

function publicConfig_() {
  // Only schedule shape — never personal data.
  return {
    daysOfWeek: CONFIG.DAYS_OF_WEEK,
    startHour: CONFIG.START_HOUR,
    endHour: CONFIG.END_HOUR,
    slotMinutes: CONFIG.SLOT_MINUTES,
    weeksAhead: CONFIG.WEEKS_AHEAD,
    timezone: CONFIG.TIMEZONE
  };
}

function takenSlots_() {
  // "YYYY-MM-DD HH:mm" strings for every PENDING or CONFIRMED future booking.
  var out = [];
  var values = sheet_().getDataRange().getValues();
  var todayKey = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  for (var r = 1; r < values.length; r++) {
    var status = String(values[r][COL.STATUS - 1]);
    if (status === 'PENDING' || status === 'CONFIRMED') {
      var date = normDate_(values[r][COL.DATE - 1]);
      if (date >= todayKey) out.push(date + ' ' + normTime_(values[r][COL.TIME - 1]));
    }
  }
  return out;
}

function isOfferedSlot_(date, time) {
  var parts = date.split('-').map(Number);
  var t = time.split(':').map(Number);
  var d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(d.getTime())) return false;
  if (CONFIG.DAYS_OF_WEEK.indexOf(d.getDay()) === -1) return false;

  var startMins = t[0] * 60 + t[1];
  if (startMins < CONFIG.START_HOUR * 60) return false;
  if (startMins + CONFIG.SLOT_MINUTES > CONFIG.END_HOUR * 60) return false;
  if ((startMins - CONFIG.START_HOUR * 60) % CONFIG.SLOT_MINUTES !== 0) return false;

  var slotStart = new Date(parts[0], parts[1] - 1, parts[2], t[0], t[1]);
  if (slotStart.getTime() <= Date.now()) return false;              // no past slots
  var max = new Date(); max.setDate(max.getDate() + CONFIG.WEEKS_AHEAD * 7); max.setHours(23, 59, 59);
  if (slotStart > max) return false;                                 // not too far out
  return true;
}

function slotTaken_(date, time) {
  var key = date + ' ' + time;
  var taken = takenSlots_();
  for (var i = 0; i < taken.length; i++) if (taken[i] === key) return true;
  return false;
}

/* ═══════════════ RATE LIMITING ═══════════════ */

function rateLimit_(email) {
  var cache = CacheService.getScriptCache();
  var totalKey = 'rl_total';
  var emailKey = 'rl_' + Utilities.base64Encode(email).slice(0, 60);

  var total = parseInt(cache.get(totalKey) || '0', 10);
  if (total >= CONFIG.MAX_TOTAL_PER_HOUR) return 'Booking is very busy right now — please try again later.';

  var mine = parseInt(cache.get(emailKey) || '0', 10);
  if (mine >= CONFIG.MAX_PER_EMAIL_PER_HOUR) return 'Too many requests from this email — please try again in an hour.';

  cache.put(totalKey, String(total + 1), 3600);
  cache.put(emailKey, String(mine + 1), 3600);
  return null;
}

/* ═══════════════ SHEET ═══════════════ */

function sheet_() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('BOOKINGS_SPREADSHEET_ID');
  var ss = null;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch (err) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
    props.setProperty('BOOKINGS_SPREADSHEET_ID', ss.getId());
  }
  var sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) {
    sh.appendRow(SHEET_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ═══════════════ CALENDAR ═══════════════ */

function createCalendarEvent_(player, parent, phone, email, date, time) {
  var p = date.split('-').map(Number);
  var t = time.split(':').map(Number);
  var start = new Date(p[0], p[1] - 1, p[2], t[0], t[1]);
  var end = new Date(start.getTime() + CONFIG.SLOT_MINUTES * 60 * 1000);
  CalendarApp.getDefaultCalendar().createEvent(
    'Catching Lesson — ' + player + ' (PAID)',
    start,
    end,
    { description: 'Parent: ' + parent + '\nPhone: ' + phone + '\nEmail: ' + email + '\nBooked via catchwithaiden.com' }
  );
}

/* ═══════════════ EMAILS ═══════════════ */

function sendParentRequestEmail_(email, parent, player, date, time) {
  var when = prettyDateTime_(date, time);
  var cashUrl = 'https://cash.app/$' + CONFIG.CASHTAG + '/' + CONFIG.PRICE;
  var subject = 'Your lesson request is in — payment locks your spot';
  var body =
    'Hi ' + esc_(parent) + ',<br><br>' +
    'Your lesson request is in!<br><br>' +
    '<b>' + esc_(player) + ' — ' + when + ' (30 min, $' + CONFIG.PRICE + ')</b><br><br>' +
    'To lock in your spot, send $' + CONFIG.PRICE + ' now:<br><br>' +
    '&bull; <b>Zelle:</b> ' + esc_(CONFIG.ZELLE_PHONE) + '<br>' +
    '&bull; <b>Cash App</b> (tap to pay — the amount pre-fills): <a href="' + cashUrl + '">' + cashUrl + '</a><br><br>' +
    '<b>Include your player\'s name and the lesson date in the payment note.</b><br><br>' +
    'Your slot is held for ' + CONFIG.HOLD_HOURS + ' hours pending payment. Once Aiden confirms it, ' +
    'you\'ll get another email with the location and what to bring.<br><br>' +
    'Questions? Text Aiden at (336) 508-2721.<br><br>— Catch With Aiden';
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: body });
}

function sendAidenRequestEmail_(id, token, parent, player, age, phone, email, date, time) {
  var base = ScriptApp.getService().getUrl();
  var confirmUrl = base + '?action=approve&id=' + id + '&token=' + token;
  var declineUrl = base + '?action=decline&id=' + id + '&token=' + token;
  var when = prettyDateTime_(date, time);
  var subject = '⚾ New lesson request: ' + player + ' — ' + when;
  var body =
    '<b>New lesson request</b><br><br>' +
    'Player: <b>' + esc_(player) + '</b> (age ' + esc_(String(age)) + ')<br>' +
    'Parent: ' + esc_(parent) + '<br>' +
    'Phone: ' + esc_(phone) + '<br>' +
    'Email: ' + esc_(email) + '<br>' +
    'When: <b>' + when + '</b> · $' + CONFIG.PRICE + '<br><br>' +
    'Wait for the Zelle / Cash App notification, then:<br><br>' +
    '<a href="' + confirmUrl + '" style="background:#2fa37b;color:#fff;padding:12px 24px;text-decoration:none;font-weight:bold;display:inline-block;">✓ CONFIRM (paid)</a>' +
    '&nbsp;&nbsp;' +
    '<a href="' + declineUrl + '" style="background:#b84812;color:#fff;padding:12px 24px;text-decoration:none;font-weight:bold;display:inline-block;">✕ DECLINE</a>' +
    '<br><br>If no payment arrives, do nothing — the request expires on its own after ' + CONFIG.HOLD_HOURS + ' hours.';
  MailApp.sendEmail({ to: CONFIG.AIDEN_EMAIL, subject: subject, htmlBody: body });
}

function sendParentConfirmedEmail_(email, parent, player, date, time) {
  var when = prettyDateTime_(date, time);
  var subject = '✓ Confirmed: catching lesson ' + when;
  var body =
    'Hi ' + esc_(parent) + ',<br><br>' +
    'Payment received — <b>' + esc_(player) + '\'s lesson is confirmed!</b><br><br>' +
    '<b>When:</b> ' + when + ' (30 minutes)<br>' +
    '<b>Where:</b> ' + esc_(CONFIG.LOCATION) + '<br>' +
    '<b>Bring:</b> ' + esc_(CONFIG.WHAT_TO_BRING) + '<br><br>' +
    'Need to reschedule? Free with 24-hour notice — just text Aiden at (336) 508-2721.<br><br>' +
    'See you behind the plate!<br>— Catch With Aiden';
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: body });
}

function sendParentDeclinedEmail_(email, parent, player, date, time) {
  var when = prettyDateTime_(date, time);
  var subject = 'About your lesson request for ' + when;
  var body =
    'Hi ' + esc_(parent) + ',<br><br>' +
    'Unfortunately that slot didn\'t work out for ' + esc_(player) + '\'s lesson (' + when + '), ' +
    'so nothing has been charged or scheduled.<br><br>' +
    'Grab another time at <a href="https://catchwithaiden.com">catchwithaiden.com</a>, ' +
    'or text Aiden at (336) 508-2721 and he\'ll help you find one.<br><br>— Catch With Aiden';
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: body });
}

/* ═══════════════ HELPERS ═══════════════ */

function clean_(v, maxLen) {
  // strip HTML/angle brackets, collapse whitespace, cap length
  return String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  return String(v);
}

function normTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, 'HH:mm');
  var s = String(v);
  return s.length === 4 ? '0' + s : s;   // "9:00" → "09:00"
}

function prettyDateTime_(date, time) {
  var p = date.split('-').map(Number);
  var t = time.split(':').map(Number);
  var d = new Date(p[0], p[1] - 1, p[2], t[0], t[1]);
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var h = t[0] % 12 === 0 ? 12 : t[0] % 12;
  var ap = t[0] >= 12 ? 'PM' : 'AM';
  var mm = t[1] < 10 ? '0' + t[1] : String(t[1]);
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ' at ' + h + ':' + mm + ' ' + ap;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function htmlPage_(mark, title, detail) {
  var color = mark === '✓' ? '#2fa37b' : '#b84812';
  var html =
    '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc_(title) + '</title></head>' +
    '<body style="margin:0;background:#0b0b0c;color:#f5f1ea;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;">' +
    '<div style="padding:40px 24px;max-width:420px;">' +
    '<div style="width:72px;height:72px;border-radius:50%;border:2px solid ' + color + ';color:' + color + ';font-size:34px;line-height:68px;margin:0 auto 24px;">' + mark + '</div>' +
    '<h1 style="font-size:26px;margin:0 0 12px;">' + esc_(title) + '</h1>' +
    '<p style="color:#c8c2b8;line-height:1.6;margin:0;">' + esc_(detail) + '</p>' +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
}
