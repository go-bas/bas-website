// Stripe over its REST API (no SDK). Needs STRIPE_SECRET_KEY, and
// STRIPE_WEBHOOK_SECRET for the webhook.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SERVICES, GROWTH, FULL_OFFICE, SETUP_FEE } from '../../site/js/services.js';

// Stripe wants nested form fields: line_items[0][price]=...
function encode(params, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') encode(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

export async function stripe(method, path, params) {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  const init = {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    signal: AbortSignal.timeout(15000),
  };
  if (params && method === 'GET') url.search = encode(params).toString();
  else if (params) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = encode(params).toString();
  }
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${json.error?.message || res.status}`);
  return json;
}

// Every price BAS sells. The lookup key carries the amount, so a price change
// in services.js makes a fresh Stripe price instead of reusing the old one.
function catalog() {
  const monthly = [...SERVICES, GROWTH, FULL_OFFICE].map((p) => ({
    id: p.id, name: p.name, amount: p.price, recurring: true, lookupKey: `bas_${p.id}_${p.price}_monthly`,
  }));
  return [...monthly, { id: SETUP_FEE.id, name: SETUP_FEE.name, amount: SETUP_FEE.price, recurring: false, lookupKey: `bas_setup_${SETUP_FEE.price}_once` }];
}

/** Stripe price ids for these catalog ids, creating any product or price that doesn't exist yet. */
export async function priceIds(ids) {
  const wanted = catalog().filter((c) => ids.includes(c.id));
  const found = await stripe('GET', 'prices', { active: 'true', limit: 100, lookup_keys: wanted.map((w) => w.lookupKey) });
  const byKey = Object.fromEntries(found.data.map((p) => [p.lookup_key, p.id]));
  const result = {};
  for (const item of wanted) {
    if (!byKey[item.lookupKey]) {
      const created = await stripe('POST', 'prices', {
        currency: 'usd',
        unit_amount: item.amount * 100,
        lookup_key: item.lookupKey,
        recurring: item.recurring ? { interval: 'month' } : undefined,
        product_data: { name: `Business Automated Systems: ${item.name}` },
        metadata: { bas_plan: item.id },
      });
      byKey[item.lookupKey] = created.id;
    }
    result[item.id] = byKey[item.lookupKey];
  }
  return result;
}

/** Checks a webhook's Stripe-Signature header; returns the parsed event or throws. */
export function verifyWebhook(rawBody, header, secret, toleranceSeconds = 300, now = Date.now()) {
  const parts = Object.fromEntries((header || '').split(',').map((kv) => kv.split('=')).filter((kv) => kv.length === 2).map(([k, v]) => [k, v]));
  const signatures = (header || '').split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  const timestamp = Number(parts.t);
  if (!timestamp || !signatures.length) throw new Error('Missing Stripe signature');
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) throw new Error('Stripe signature is too old');
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const ok = signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error('Stripe signature does not match');
  return JSON.parse(rawBody);
}
