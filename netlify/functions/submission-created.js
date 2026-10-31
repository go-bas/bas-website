// Netlify runs this after each verified form submission (spam already filtered).
// The assessment form becomes a Lead in the YPS CRM. Netlify's own form email
// still goes out, so a CRM problem never loses a request.
import { createAssessmentLead, isCrmConfigured } from '../lib/crm.js';

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function handler(event) {
  let payload;
  try {
    ({ payload } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: 'Bad payload' };
  }
  if (payload?.form_name !== 'assessment') return { statusCode: 200, body: 'Not the assessment form' };
  if (!isCrmConfigured()) return { statusCode: 200, body: 'CRM not set up' };

  const d = payload.data || {};
  const lead = {
    name: clip(d.name, 100),
    email: clip(d.email, 200),
    phone: clip(d.phone, 40),
    company: clip(d.company, 150),
    need: clip(d.interest, 200),
    notes: clip(d.notes, 2000),
    savings: clip(d.savings, 300),
  };
  if (!lead.name || !lead.email) return { statusCode: 200, body: 'Missing name or email' };

  try {
    const id = await createAssessmentLead(lead);
    return { statusCode: 200, body: `CRM lead ${id}` };
  } catch (err) {
    // Netlify doesn't retry these; the request is still in Netlify Forms and your email.
    console.error('[submission-created] CRM failed:', err.message);
    return { statusCode: 200, body: 'CRM failed' };
  }
}
