// /api/send-receipt.js
// Vercel serverless function that emails both host and new contact via Resend,
// and (best-effort) records the contact in HubSpot + enrolls them in a nurture list.
// Required env vars: RESEND_API_KEY, FROM_EMAIL, HOST_EMAIL
// Optional env vars: HUBSPOT_ACCESS_TOKEN, HUBSPOT_LIST_ID (if absent, HubSpot step is skipped)

import { upsertContactAndEnroll } from './_hubspot.js';
import { BRAND, EVENT } from './_config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, title, email, topic, timestamp } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const HOST_EMAIL = process.env.HOST_EMAIL || BRAND.email;
  const FROM_EMAIL = process.env.FROM_EMAIL || `${BRAND.name} <${HOST_EMAIL}>`;
  const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
  const HUBSPOT_LIST_ID = process.env.HUBSPOT_LIST_ID;

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const date = new Date(timestamp || Date.now());
  const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: EVENT.timezone });
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: EVENT.timezone, timeZoneName: 'short' });

  const contactHtml = buildContactEmail({ name, title, email, topic, dateStr, timeStr });
  const hostHtml    = buildHostEmail({ name, title, email, topic, dateStr, timeStr });

  const sendEmail = (to, subject, html, replyTo) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
      reply_to: replyTo
    })
  }).then(async (r) => {
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return r.json();
  });

  const firstName = name.split(' ')[0];
  const operations = [
    { name: 'resend_contact', kind: 'critical', run: () => sendEmail(email, `Good to meet you at ${EVENT.name}, ${firstName}`, contactHtml, HOST_EMAIL) },
    { name: 'resend_host',    kind: 'critical', run: () => sendEmail(HOST_EMAIL, `New connection: ${name} (${topic})`, hostHtml) }
  ];

  if (HUBSPOT_ACCESS_TOKEN && HUBSPOT_LIST_ID) {
    operations.push({
      name: 'hubspot_upsert',
      kind: 'best_effort',
      run: () => upsertContactAndEnroll({ name, title, email, topic, timestamp, listId: HUBSPOT_LIST_ID, token: HUBSPOT_ACCESS_TOKEN })
    });
  }

  const settled = await Promise.allSettled(operations.map(op => op.run()));

  let criticalFailed = false;
  settled.forEach((result, i) => {
    const op = operations[i];
    if (result.status === 'rejected') {
      const reason = result.reason?.message || String(result.reason);
      if (op.kind === 'critical') {
        criticalFailed = true;
        console.error('Receipt send failed', { op: op.name, email, name, topic, reason });
      } else {
        console.error('Best-effort op failed', { op: op.name, email, name, topic, reason });
      }
      return;
    }
    if (op.name === 'hubspot_upsert' && Array.isArray(result.value?.partialErrors) && result.value.partialErrors.length > 0) {
      console.warn('HubSpot partial enrichment failure', {
        email, name, topic,
        contactId: result.value.contactId,
        listAdded: result.value.listAdded,
        noteCreated: result.value.noteCreated,
        partialErrors: result.value.partialErrors
      });
    }
  });

  if (criticalFailed) return res.status(500).json({ error: 'Send failed' });
  return res.status(200).json({ success: true });
}

function buildContactEmail({ name, title, email, topic, dateStr, timeStr }) {
  const firstName = name.split(' ')[0];
  const C = BRAND.colors;
  const logoMark = BRAND.logoUrl
    ? `<img src="${escapeHtml(BRAND.logoUrl)}" width="28" height="28" alt="" style="display:inline-block;width:28px;height:28px;margin-right:10px;vertical-align:middle;" />`
    : `<span style="display:inline-block;background:${C.primary};color:${C.accent};width:28px;height:28px;border-radius:6px;text-align:center;font-weight:800;font-family:Georgia,serif;font-size:13px;line-height:28px;margin-right:10px;vertical-align:middle;">${escapeHtml(BRAND.initials)}</span>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt</title></head>
<body style="margin:0;padding:0;background:${C.paperDim};font-family:'Helvetica Neue',Arial,sans-serif;color:${C.primary};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.paperDim};padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:${C.paper};border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(16,45,80,0.08);">
        <tr><td style="padding:32px 36px 24px;border-bottom:1px dashed rgba(16,45,80,0.2);">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:${C.primary};font-weight:600;">
            ${logoMark}${escapeHtml(BRAND.company)}
          </div>
        </td></tr>
        <tr><td style="padding:28px 36px 16px;">
          <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${C.alert};font-weight:700;">Conversation Receipt</div>
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:${C.primary};margin-top:10px;">
            Good to meet you, ${escapeHtml(firstName)}.
          </div>
        </td></tr>
        <tr><td style="padding:0 36px 8px;">
          <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(16,45,80,0.5);font-weight:600;margin:16px 0 12px;">&mdash; The details &mdash;</div>
        </td></tr>
        <tr><td style="padding:0 36px;">
          ${row('Topic', topic)}
          ${row('Where', `${escapeHtml(EVENT.name)} &middot; ${escapeHtml(EVENT.venue)}`, true)}
          ${row('When', `${dateStr} &middot; ${timeStr}`, true)}
          ${row('You', title || '—')}
        </td></tr>
        <tr><td style="padding:24px 36px 8px;">
          <div style="background:rgba(250,168,64,0.12);border-left:3px solid ${C.accent};border-radius:6px;padding:16px;font-size:14px;line-height:1.55;color:${C.primary};">
            Thanks for the conversation today. If anything sparked something, just reply to this email. I read every one personally.
          </div>
        </td></tr>
        <tr><td style="padding:20px 36px 6px;" align="center">
          <a href="${escapeHtml(BRAND.website)}" target="_blank" style="display:inline-block;background:${C.accent};color:${C.primary};text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;font-family:'Helvetica Neue',Arial,sans-serif;">
            <span style="display:inline-block;background:${C.primary};color:${C.accent};width:22px;height:22px;border-radius:4px;text-align:center;font-weight:800;font-family:Georgia,serif;font-size:11px;line-height:22px;margin-right:8px;vertical-align:middle;">${escapeHtml(BRAND.initials)}</span>
            Learn more about ${escapeHtml(BRAND.company)}
          </a>
        </td></tr>
        <tr><td style="padding:6px 36px 8px;" align="center">
          <a href="${escapeHtml(BRAND.linkedin)}" target="_blank" style="display:inline-block;background:#0a66c2;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;font-family:'Helvetica Neue',Arial,sans-serif;">
            <span style="display:inline-block;background:#ffffff;color:#0a66c2;width:22px;height:22px;border-radius:4px;text-align:center;font-weight:800;font-family:Georgia,serif;font-size:13px;line-height:22px;margin-right:8px;vertical-align:middle;">in</span>
            Connect with ${escapeHtml(BRAND.name.split(' ')[0])} on LinkedIn
          </a>
        </td></tr>
        <tr><td style="padding:16px 36px 32px;border-top:1px dashed rgba(16,45,80,0.2);">
          <div style="padding-top:20px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:${C.primary};">${escapeHtml(BRAND.name)}</div>
            <div style="font-size:13px;color:rgba(16,45,80,0.7);margin-top:4px;">${escapeHtml(BRAND.title)}, ${escapeHtml(BRAND.company)}</div>
            <div style="font-size:13px;margin-top:14px;">
              <a href="mailto:${escapeHtml(BRAND.email)}" style="color:${C.primary};text-decoration:none;border-bottom:1px solid rgba(16,45,80,0.3);">${escapeHtml(BRAND.email)}</a>
            </div>
          </div>
        </td></tr>
      </table>
      <div style="font-size:11px;color:rgba(16,45,80,0.5);margin-top:16px;letter-spacing:0.05em;">
        Sent from the conference floor. No business cards were harmed.
      </div>
    </td></tr>
  </table>
</body></html>`;
}

function row(key, value, rawValue = false) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid rgba(16,45,80,0.08);">
    <tr>
      <td style="padding:12px 0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(16,45,80,0.6);font-weight:600;width:30%;">${escapeHtml(key)}</td>
      <td style="padding:12px 0;font-size:14px;color:${BRAND.colors.primary};text-align:right;font-weight:500;">${rawValue ? value : escapeHtml(value)}</td>
    </tr>
  </table>`;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function buildHostEmail({ name, title, email, topic, dateStr, timeStr }) {
  const companyMatch = (title || '').match(/(?:\bat\b|@|,)\s*(.+)$/i);
  const company = companyMatch ? companyMatch[1].trim() : '';
  const query = company ? `${name} ${company}` : name;
  const linkedInSearch = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,sans-serif;background:${BRAND.colors.paperDim};padding:32px;color:${BRAND.colors.primary};">
  <h2 style="color:${BRAND.colors.primary};font-family:Georgia,serif;">New ${escapeHtml(EVENT.name)} connection</h2>
  <p><strong>Name:</strong> ${escapeHtml(name)}<br>
  <strong>Title:</strong> ${escapeHtml(title)}<br>
  <strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a><br>
  <strong>Topic:</strong> ${escapeHtml(topic)}<br>
  <strong>When:</strong> ${dateStr} &middot; ${timeStr}</p>
  <p style="margin-top:20px;"><a href="${linkedInSearch}" style="display:inline-block;background:#0a66c2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Find ${escapeHtml(name.split(' ')[0])} on LinkedIn &rarr;</a></p>
  <p style="margin-top:24px;font-size:13px;color:rgba(16,45,80,0.6);">Auto-logged from the Event Lead Receipt app.</p>
</body></html>`;
}
