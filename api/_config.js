// Server-side branding & content. Env vars take precedence over defaults.
// Defaults should mirror src/config.js where they overlap (host name, event, colors).

export const BRAND = {
  name: process.env.HOST_NAME || 'Your Name',
  title: process.env.HOST_TITLE || 'Your Title',
  company: process.env.HOST_COMPANY || 'Your Company',
  email: process.env.HOST_EMAIL || 'you@example.com',
  linkedin: process.env.HOST_LINKEDIN || 'https://linkedin.com/in/yourhandle',
  website: process.env.HOST_WEBSITE || 'https://example.com',
  initials: process.env.HOST_INITIALS || 'YC',
  logoUrl: process.env.PUBLIC_LOGO_URL || '',
  colors: {
    primary: '#102d50',
    accent:  '#faa840',
    alert:   '#ef4537',
    paper:   '#faf8f5',
    paperDim:'#f5f3ee'
  }
};

export const EVENT = {
  name:     process.env.EVENT_NAME || 'Your Conference',
  venue:    process.env.EVENT_VENUE || 'Venue Name',
  timezone: process.env.EVENT_TIMEZONE || 'America/Chicago'
};

export const HUBSPOT = {
  topicProperty:    process.env.HUBSPOT_TOPIC_PROPERTY || 'conference_topic',
  linkedinProperty: process.env.HUBSPOT_LINKEDIN_PROPERTY || 'linkedin_profile_url'
};
