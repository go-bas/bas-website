// Offline tests for the Netlify functions: fetch is replaced, so no CRM,
// Stripe or email account is needed. Run with `npm test`.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handler as submissionCreated } from '../netlify/functions/submission-created.js';
import { handler as checkout } from '../netlify/functions/checkout.js';
import { handler as webhook } from '../netlify/functions/stripe-webhook.js';
import { verifyWebhook } from '../netlify/lib/stripe.js';
import { __resetCrmSessionForTests } from '../netlify/lib/crm.js';

let calls;
let respond;
globalThis.fetch = async (url, init = {}) => {
  const call = { url: String(url), method: init.method || 'GET', body: init.body ? String(init.body) : '' };
  calls.push(call);
  const [status, json] = respond(call);
  return new Response(JSON.stringify(json), { status });
};

const crmEnv = { SUITECRM_BASE_URL: 'https://crm.test', SUITECRM_API_USER: 'api', SUITECRM_API_PASSWORD: 'pw' };
const emailEnv = { RESEND_API_KEY: 're_test', BAS_NOTIFY_EMAIL: 'owner@bas.test' };
const ALL_ENV = ['SITE_URL', 'URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'EMAIL_FROM', ...Object.keys(crmEnv), ...Object.keys(emailEnv)];
function setEnv(vars) {
  for (const k of ALL_ENV) delete process.env[k];
  Object.assign(process.env, vars);
}

// The CRM answers login and set_entry; get_entry_list returns `existing` opportunities.
const crm = (existing = []) => (call) => {
  if (call.url.includes('rest.php')) {
    const method = new URLSearchParams(call.body).get('method');
    if (method === 'login') return [200, { id: 'sess1' }];
    if (method === 'get_entry_list') return [200, { entry_list: existing }];
    if (method === 'set_entry') return [200, { id: 'rec1' }];
  }
  if (call.url.includes('resend.com')) return [200, { id: 'email1' }];
  return [404, {}];
};
const crmFields = (call) => {
  const data = JSON.parse(new URLSearchParams(call.body).get('rest_data'));
  return { module: data.module_name, ...Object.fromEntries(data.name_value_list.map((f) => [f.name, f.value])) };
};
const setEntryCall = () => calls.find((c) => new URLSearchParams(c.body).get('method') === 'set_entry');
const post = (body, headers = {}) => ({ httpMethod: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

beforeEach(() => {
  calls = [];
  respond = () => [500, {}];
  __resetCrmSessionForTests();
});

// --- Booking form → CRM ---

const submission = (data, form = 'assessment') => post({ payload: { form_name: form, data } });

test('a booking form request becomes a CRM lead with the calculator result and notes', async () => {
  setEnv(crmEnv);
  respond = crm();
  const res = await submissionCreated(
    submission({ name: 'Mary Smith', email: 'mary@example.com', company: 'Smith Funeral Home', phone: '619-555-0100', interest: 'Bookkeeping', notes: 'Busy season is spring', savings: 'Bookkeeping. Saves $3,028/mo.' })
  );
  assert.equal(res.statusCode, 200);
  const f = crmFields(setEntryCall());
  assert.equal(f.module, 'Leads');
  assert.equal(f.first_name, 'Mary');
  assert.equal(f.last_name, 'Smith');
  assert.equal(f.account_name, 'Smith Funeral Home');
  assert.equal(f.phone_work, '619-555-0100');
  assert.equal(f.lead_source, 'Website');
  assert.match(f.description, /Wants to automate first: Bookkeeping/);
  assert.match(f.description, /Notes: Busy season is spring/);
  assert.match(f.description, /Saves \$3,028\/mo/);
});

test('other forms, missing details or no CRM settings are ignored without errors', async () => {
  setEnv(crmEnv);
  respond = crm();
  assert.equal((await submissionCreated(submission({ name: 'A', email: 'a@b.co' }, 'newsletter'))).statusCode, 200);
  assert.equal((await submissionCreated(submission({ name: '', email: 'a@b.co' }))).statusCode, 200);
  setEnv({});
  assert.equal((await submissionCreated(submission({ name: 'A', email: 'a@b.co' }))).statusCode, 200);
  assert.equal(calls.length, 0);
});

test('a CRM outage still answers 200 (the request is safe in Netlify Forms and email)', async () => {
  setEnv(crmEnv);
  respond = () => [503, {}];
  assert.equal((await submissionCreated(submission({ name: 'A', email: 'a@b.co' }))).statusCode, 200);
});

// --- Checkout ---

test('checkout: Growth needs exactly 3 known services; unknown plans are refused', async () => {
  setEnv({ STRIPE_SECRET_KEY: 'sk_test_x' });
  assert.equal((await checkout(post({ plan: 'growth', services: ['books', 'social'] }))).statusCode, 400);
  assert.equal((await checkout(post({ plan: 'growth', services: ['books', 'social', 'nope'] }))).statusCode, 400);
  assert.equal((await checkout(post({ plan: 'nope' }))).statusCode, 400);
  assert.equal((await checkout({ httpMethod: 'GET', headers: {} })).statusCode, 405);
});

test('checkout: says checkout is off until Stripe is set up', async () => {
  setEnv({});
  assert.equal((await checkout(post({ plan: 'books' }))).statusCode, 503);
});

test('checkout: creates missing Stripe prices from services.js and starts a subscription', async () => {
  setEnv({ STRIPE_SECRET_KEY: 'sk_test_x', SITE_URL: 'https://bas.test/' });
  respond = (call) => {
    if (call.url.includes('/v1/prices') && call.method === 'GET') return [200, { data: [{ id: 'price_setup', lookup_key: 'bas_setup_499_once' }] }];
    if (call.url.includes('/v1/prices')) return [200, { id: 'price_growth' }];
    if (call.url.includes('/v1/checkout/sessions')) return [200, { url: 'https://checkout.stripe.test/s' }];
    return [404, {}];
  };
  const res = await checkout(post({ plan: 'growth', services: ['books', 'social', 'phones'], price: 1 }));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).url, 'https://checkout.stripe.test/s');

  const created = new URLSearchParams(calls.find((c) => c.url.endsWith('/v1/prices') && c.method === 'POST').body);
  assert.equal(created.get('unit_amount'), '89900'); // the server's price, not the browser's
  assert.equal(created.get('recurring[interval]'), 'month');
  assert.equal(created.get('lookup_key'), 'bas_growth_899_monthly');

  const session = new URLSearchParams(calls.find((c) => c.url.includes('checkout/sessions')).body);
  assert.equal(session.get('mode'), 'subscription');
  assert.equal(session.get('line_items[0][price]'), 'price_growth');
  assert.equal(session.get('line_items[1][price]'), 'price_setup');
  assert.equal(session.get('metadata[bas_services]'), 'Bookkeeping, Social media, AI receptionist');
  assert.equal(session.get('success_url'), 'https://bas.test/welcome.html?session_id={CHECKOUT_SESSION_ID}');
});

// --- Stripe webhook ---

const SECRET = 'whsec_test';
function signed(evt, secret = SECRET, t = Math.floor(Date.now() / 1000), base64 = false) {
  const raw = JSON.stringify(evt);
  const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return {
    httpMethod: 'POST',
    headers: { 'stripe-signature': `t=${t},v1=${sig}` },
    body: base64 ? Buffer.from(raw).toString('base64') : raw,
    isBase64Encoded: base64,
  };
}
const paid = {
  type: 'checkout.session.completed',
  data: { object: {
    id: 'cs_test_123', payment_status: 'paid', amount_total: 139800,
    metadata: { bas_plan_name: 'Growth bundle', bas_services: 'Bookkeeping, Social media, AI receptionist' },
    customer_details: { name: 'Mary Smith', email: 'mary@example.com', phone: '+16195550100' },
    custom_fields: [{ key: 'company', text: { value: 'Smith Funeral Home' } }],
  } },
};

test('webhook: rejects a bad or old signature', async () => {
  setEnv({ STRIPE_WEBHOOK_SECRET: SECRET, ...crmEnv });
  assert.equal((await webhook(signed(paid, 'whsec_wrong'))).statusCode, 400);
  assert.equal((await webhook(signed(paid, SECRET, Math.floor(Date.now() / 1000) - 3600))).statusCode, 400);
  assert.equal(calls.length, 0);
});

test('webhook: a paid checkout becomes a Closed Won opportunity and an email (base64 body too)', async () => {
  setEnv({ STRIPE_WEBHOOK_SECRET: SECRET, ...crmEnv, ...emailEnv });
  respond = crm();
  const res = await webhook(signed(paid, SECRET, undefined, true));
  assert.equal(res.statusCode, 200);
  const f = crmFields(setEntryCall());
  assert.equal(f.module, 'Opportunities');
  assert.equal(f.sales_stage, 'Closed Won');
  assert.equal(f.amount, '1398.00');
  assert.equal(f.name, 'BAS: Growth bundle for Smith Funeral Home');
  assert.match(f.description, /cs_test_123/);
  const email = JSON.parse(calls.find((c) => c.url.includes('resend.com')).body);
  assert.deepEqual(email.to, ['owner@bas.test']);
});

test('webhook: a repeat delivery is not recorded twice', async () => {
  setEnv({ STRIPE_WEBHOOK_SECRET: SECRET, ...crmEnv, ...emailEnv });
  respond = crm([{ id: 'opp1' }]);
  assert.equal((await webhook(signed(paid))).statusCode, 200);
  assert.ok(!setEntryCall());
  assert.ok(!calls.some((c) => c.url.includes('resend.com')));
});

test('webhook: CRM down answers 500 so Stripe retries', async () => {
  setEnv({ STRIPE_WEBHOOK_SECRET: SECRET, ...crmEnv });
  respond = () => [503, {}];
  assert.equal((await webhook(signed(paid))).statusCode, 500);
});

test('webhook: other events are acknowledged and ignored', async () => {
  setEnv({ STRIPE_WEBHOOK_SECRET: SECRET, ...crmEnv });
  assert.equal((await webhook(signed({ type: 'invoice.paid', data: { object: {} } }))).statusCode, 200);
  assert.equal(calls.length, 0);
});

test('verifyWebhook accepts a correct signature among several', () => {
  const raw = '{"type":"x"}';
  const t = 1700000000;
  const good = createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex');
  assert.equal(verifyWebhook(raw, `t=${t},v1=${'0'.repeat(64)},v1=${good}`, SECRET, 300, t * 1000).type, 'x');
});
