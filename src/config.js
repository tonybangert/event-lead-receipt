// Single source of truth for client-side branding & content.
// Edit this file to rebrand the app. Server-side branding lives in api/_config.js.

export const BRAND = {
  name: 'Your Name',
  title: 'Your Title',
  company: 'Your Company',
  email: 'you@example.com',
  linkedin: 'https://linkedin.com/in/yourhandle',
  website: 'https://example.com',
  logoSrc: '/logo.svg',
  initials: 'YC',
  colors: {
    primary: '#102d50',
    primaryDeep: '#0a1f3d',
    primaryMid: '#1a3a6e',
    accent: '#faa840',
    alert: '#ef4537',
    paper: '#faf8f5',
    paperDim: '#f5f3ee'
  }
};

export const EVENT = {
  name: 'Your Conference',
  venue: 'Venue Name',
  date: 'May 21, 2026',
  timezone: 'America/Chicago'
};

export const TOPICS = [
  'Revenue Growth',
  'AI Enablement',
  'Partnership Opportunity',
  'Small Talk'
];

export const STORAGE_KEY = 'event_receipts';
export const CSV_PREFIX = 'event-connections';
