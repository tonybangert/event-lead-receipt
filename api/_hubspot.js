// HubSpot client for the event-lead-receipt app.
// Uses a Private App access token (server-only, never shipped to the browser).
// Upserts the contact by email, adds them to a Static List which a HubSpot
// Workflow uses as its enrollment trigger, and creates an activity-timeline
// Note capturing the event context.

import { BRAND, EVENT, HUBSPOT } from './_config.js';

const HUBSPOT_BASE = 'https://api.hubapi.com';

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'me.com',
  'live.com', 'msn.com', 'fastmail.com', 'ymail.com'
]);

export function splitName(fullName) {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { firstname: '', lastname: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0], lastname: '' };
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
}

export function parseTitleAndCompany(titleField) {
  const t = (titleField || '').trim();
  if (!t) return { jobtitle: '', company: '' };
  // \bat\b requires "at" as a standalone word — without word boundaries the
  // regex falsely splits "Director of Operations" inside the word "Operations".
  const match = t.match(/^(.+?)\s*(?:\bat\b|@|,)\s*(.+)$/i);
  if (match) return { jobtitle: match[1].trim(), company: match[2].trim() };
  return { jobtitle: t, company: '' };
}

export function extractEmailDomain(email) {
  const at = (email || '').lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase();
}

export function deriveCompanyWebsite(emailDomain) {
  if (!emailDomain) return '';
  if (PERSONAL_EMAIL_DOMAINS.has(emailDomain)) return '';
  return `https://${emailDomain}`;
}

export function buildLinkedInSearchUrl(name, company) {
  const cleanName = (name || '').trim();
  const cleanCompany = (company || '').trim();
  const query = cleanCompany ? `${cleanName} ${cleanCompany}` : cleanName;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

export function buildNoteHtml({ name, title, email, topic, timestamp, emailDomain, companyWebsite, linkedinUrl }) {
  const date = new Date(timestamp || Date.now());
  const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: EVENT.timezone });
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: EVENT.timezone, timeZoneName: 'short' });

  const linkedinAnchor = `<a href="${escapeHtml(linkedinUrl)}">${escapeHtml(name || 'LinkedIn search')}</a>`;
  const websiteLine = companyWebsite
    ? `<li>Company website: <a href="${escapeHtml(companyWebsite)}">${escapeHtml(companyWebsite)}</a></li>`
    : '';

  return [
    `<p><strong>Event capture: ${escapeHtml(EVENT.name)}</strong></p>`,
    `<ul>`,
    `<li><strong>Topic:</strong> ${escapeHtml(topic || '—')}</li>`,
    `<li><strong>When:</strong> ${escapeHtml(dateStr)} · ${escapeHtml(timeStr)}</li>`,
    `<li><strong>Where:</strong> ${escapeHtml(EVENT.venue)}</li>`,
    `</ul>`,
    `<p><strong>Captured</strong></p>`,
    `<ul>`,
    `<li>Name: ${escapeHtml(name || '—')}</li>`,
    `<li>Title as entered: ${escapeHtml(title || '—')}</li>`,
    `<li>Email: ${escapeHtml(email)}</li>`,
    `</ul>`,
    `<p><strong>Derived enrichment</strong></p>`,
    `<ul>`,
    `<li>Email domain: ${escapeHtml(emailDomain || '—')}</li>`,
    websiteLine,
    `<li>LinkedIn search: ${linkedinAnchor}</li>`,
    `</ul>`
  ].filter(Boolean).join('');
}

async function createContactNote({ contactId, noteHtml, timestamp, hapikeyQuery, authHeader }) {
  // v1 engagements works on the existing contacts write scope on most portals
  // (including Starter Customer Platform). v3 /crm/v3/objects/notes requires
  // an explicit crm.objects.notes.write scope that those portals don't expose.
  const tsMs = new Date(timestamp || Date.now()).getTime();
  const res = await fetch(`${HUBSPOT_BASE}/engagements/v1/engagements${hapikeyQuery}`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      engagement: { active: true, type: 'NOTE', timestamp: tsMs },
      associations: { contactIds: [Number(contactId)] },
      metadata: { body: noteHtml }
    })
  });
  if (!res.ok) throw new Error(`Note create failed (${res.status}): ${await res.text()}`);
  return await res.json();
}

export async function upsertContactAndEnroll({ name, title, email, topic, timestamp, listId, token }) {
  if (!email) throw new Error('upsertContactAndEnroll: email required');
  if (!token) throw new Error('upsertContactAndEnroll: HubSpot token missing');
  if (!listId) throw new Error('upsertContactAndEnroll: list id missing');

  const { firstname, lastname } = splitName(name);
  const { jobtitle, company } = parseTitleAndCompany(title);
  const emailDomain = extractEmailDomain(email);
  const companyWebsite = deriveCompanyWebsite(emailDomain);
  const linkedinUrl = buildLinkedInSearchUrl(name, company);

  const isPrivateAppToken = token.startsWith('pat-');
  const authHeader = isPrivateAppToken ? { 'Authorization': `Bearer ${token}` } : {};
  const hapikeyQuery = isPrivateAppToken ? '' : `?hapikey=${encodeURIComponent(token)}`;

  const properties = {
    email,
    firstname,
    lastname,
    jobtitle,
    company,
    [HUBSPOT.topicProperty]: topic || '',
    [HUBSPOT.linkedinProperty]: linkedinUrl,
    lifecyclestage: 'lead',
    hs_lead_status: 'NEW'
  };
  if (companyWebsite) properties.website = companyWebsite;

  let contactId;

  if (isPrivateAppToken) {
    const upsertRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/batch/upsert`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: [{ idProperty: 'email', id: email, properties }]
      })
    });
    if (!upsertRes.ok) {
      throw new Error(`HubSpot upsert failed (${upsertRes.status}): ${await upsertRes.text()}`);
    }
    const upsertBody = await upsertRes.json();
    contactId = upsertBody?.results?.[0]?.id || null;
  } else {
    const v1Props = Object.entries(properties).map(([property, value]) => ({ property, value }));
    const upsertRes = await fetch(
      `${HUBSPOT_BASE}/contacts/v1/contact/createOrUpdate/email/${encodeURIComponent(email)}${hapikeyQuery}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: v1Props })
      }
    );
    if (!upsertRes.ok) {
      throw new Error(`HubSpot upsert failed (${upsertRes.status}): ${await upsertRes.text()}`);
    }
    const upsertBody = await upsertRes.json();
    contactId = upsertBody?.vid || null;
  }

  if (!contactId) {
    throw new Error('HubSpot upsert returned no contact id; cannot add to list or create note');
  }

  const noteHtml = buildNoteHtml({
    name, title, email, topic, timestamp,
    emailDomain, companyWebsite, linkedinUrl
  });

  const listAddPromise = fetch(
    `${HUBSPOT_BASE}/contacts/v1/lists/${listId}/add${hapikeyQuery}`,
    {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: [email] })
    }
  ).then(async (r) => {
    if (!r.ok) throw new Error(`List-add failed (${r.status}): ${await r.text()}`);
    return r.json();
  });

  const noteCreatePromise = createContactNote({
    contactId, noteHtml, timestamp, hapikeyQuery, authHeader
  });

  const [listResult, noteResult] = await Promise.allSettled([listAddPromise, noteCreatePromise]);

  const partialErrors = [];
  if (listResult.status === 'rejected') {
    partialErrors.push({ op: 'list_add', reason: listResult.reason?.message || String(listResult.reason) });
  }
  if (noteResult.status === 'rejected') {
    partialErrors.push({ op: 'note_create', reason: noteResult.reason?.message || String(noteResult.reason) });
  }

  return {
    contactId,
    listAdded: listResult.status === 'fulfilled',
    noteCreated: noteResult.status === 'fulfilled',
    partialErrors
  };
}
