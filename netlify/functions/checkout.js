// POST /api/checkout: starts a Stripe Checkout for a monthly plan plus the setup fee.
// Prices always come from site/js/services.js on the server, never from the browser.
import { findPlan, SERVICES } from '../../site/js/services.js';
import { priceIds, stripe } from '../lib/stripe.js';

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function siteUrl(event) {
  const host = event.headers?.host;
  return (process.env.SITE_URL || process.env.URL || (host ? `https://${host}` : '')).replace(/\/+$/, '');
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });
  if (!process.env.STRIPE_SECRET_KEY) {
    return json(503, { error: 'Online checkout is not switched on yet. Please book a free assessment instead.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '');
  } catch {
    return json(400, { error: 'Please choose a plan.' });
  }

  const plan = findPlan(body.plan);
  if (!plan) return json(400, { error: 'Please choose a plan.' });

  // Growth covers exactly 3 services; the client picks which.
  let picked = [];
  if (plan.picks) {
    const ids = Array.isArray(body.services) ? [...new Set(body.services)] : [];
    picked = SERVICES.filter((s) => ids.includes(s.id));
    if (picked.length !== plan.picks || picked.length !== ids.length) {
      return json(400, { error: `Please pick ${plan.picks} services for the ${plan.name}.` });
    }
  }
  const services = plan.picks ? picked.map((s) => s.name).join(', ') : plan.id === 'full' ? 'All 7 services' : plan.name;

  try {
    const prices = await priceIds([plan.id, 'setup']);
    const metadata = { bas_plan: plan.id, bas_plan_name: plan.name, bas_services: services };
    const site = siteUrl(event);
    const session = await stripe('POST', 'checkout/sessions', {
      mode: 'subscription',
      line_items: [
        { price: prices[plan.id], quantity: 1 },
        { price: prices.setup, quantity: 1 },
      ],
      success_url: `${site}/welcome.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/start.html?plan=${plan.id}`,
      allow_promotion_codes: 'true',
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: 'true' },
      custom_fields: [{ key: 'company', label: { type: 'custom', custom: 'Business name' }, type: 'text' }],
      metadata,
      subscription_data: { metadata },
    });
    return json(200, { url: session.url });
  } catch (err) {
    console.error('[checkout] failed:', err.message);
    return json(502, { error: 'Sorry, checkout is not available just now. Please try again or book a free assessment.' });
  }
}
