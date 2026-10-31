// YPS CRM (SuiteCRM) over its v4.1 REST API, the same way the YPS app talks to it.
// Needs SUITECRM_BASE_URL, SUITECRM_API_USER and SUITECRM_API_PASSWORD.
import { createHash } from 'node:crypto';

const ADMIN_USER_ID = '1'; // Robert; new records are assigned here
const TIMEOUT_MS = 10000;
let session = null;

export function isCrmConfigured() {
  return Boolean(process.env.SUITECRM_BASE_URL && process.env.SUITECRM_API_USER && process.env.SUITECRM_API_PASSWORD);
}

async function restCall(method, restData) {
  const base = process.env.SUITECRM_BASE_URL.replace(/\/+$/, '');
  const res = await fetch(`${base}/legacy/service/v4_1/rest.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${base}/index.php` },
    body: new URLSearchParams({ method, input_type: 'JSON', response_type: 'JSON', rest_data: JSON.stringify(restData) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`CRM ${method}: HTTP ${res.status}`);
  const json = await res.json();
  if (json && json.number && json.name && !json.id && !json.entry_list) {
    throw new Error(`CRM ${method}: ${json.name}${json.description ? ` (${json.description})` : ''}`);
  }
  return json;
}

async function login() {
  if (session && session.expiresAt > Date.now()) return session.id;
  const password = createHash('md5').update(process.env.SUITECRM_API_PASSWORD).digest('hex');
  const result = await restCall('login', {
    user_auth: { user_name: process.env.SUITECRM_API_USER, password },
    application_name: 'Business Automated Systems website',
  });
  if (!result.id) throw new Error('CRM login returned no session');
  session = { id: result.id, expiresAt: Date.now() + 20 * 60 * 1000 };
  return session.id;
}

// Retries once with a fresh login if the session has expired.
async function withSession(fn) {
  try {
    return await fn(await login());
  } catch (err) {
    if (!/session|login|invalid/i.test(err.message)) throw err;
    session = null;
    return fn(await login());
  }
}

function nameValueList(fields) {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([name, value]) => ({ name, value: String(value) }));
}

async function setEntry(moduleName, fields) {
  const result = await withSession((s) => restCall('set_entry', { session: s, module_name: moduleName, name_value_list: nameValueList(fields) }));
  if (!result.id) throw new Error(`CRM set_entry(${moduleName}) returned no id`);
  return result.id;
}

/** A free-assessment request from the website becomes a Lead. */
export async function createAssessmentLead({ name, email, phone, company, need, notes, savings }) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const lines = [
    'Business Automated Systems: free assessment request from the website.',
    need && `Wants to automate first: ${need}`,
    notes && `Notes: ${notes}`,
    savings && `ROI calculator: ${savings}`,
  ].filter(Boolean);
  return setEntry('Leads', {
    first_name: rest.length ? first : '',
    last_name: rest.length ? rest.join(' ') : first,
    account_name: company,
    email1: email,
    phone_work: phone,
    lead_source: 'Website',
    lead_source_description: 'BAS website: free assessment',
    description: lines.join('\n'),
    status: 'New',
    assigned_user_id: ADMIN_USER_ID,
  });
}

/** A paid checkout becomes a Closed Won Opportunity. Returns null if it was already recorded. */
export async function recordSale({ sessionId, plan, services, amount, customerName, email, phone, company }) {
  const safeId = String(sessionId).replace(/[^A-Za-z0-9_]/g, '');
  const existing = await withSession((s) => restCall('get_entry_list', {
    session: s,
    module_name: 'Opportunities',
    query: `opportunities.description LIKE '%${safeId}%'`,
    order_by: '',
    offset: 0,
    select_fields: ['id'],
    link_name_to_fields_array: [],
    max_results: 1,
    deleted: 0,
  }));
  if (existing.entry_list && existing.entry_list.length) return null;

  return setEntry('Opportunities', {
    name: `BAS: ${plan}${company ? ` for ${company}` : customerName ? ` for ${customerName}` : ''}`,
    amount: amount.toFixed(2),
    sales_stage: 'Closed Won',
    probability: '100',
    date_closed: new Date().toISOString().slice(0, 10),
    lead_source: 'Website',
    description: [
      'Business Automated Systems subscription paid by Stripe checkout.',
      `Plan: ${plan}`,
      services && `Services: ${services}`,
      `Customer: ${[customerName, email, phone].filter(Boolean).join(', ')}`,
      `Stripe checkout: ${safeId}`,
    ].filter(Boolean).join('\n'),
    assigned_user_id: ADMIN_USER_ID,
  });
}

export function __resetCrmSessionForTests() {
  session = null;
}
