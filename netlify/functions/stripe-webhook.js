// POST /api/stripe-webhook: when a checkout is paid, record the sale in the YPS CRM and email Robert.
// Stripe retries until this answers 200, so a CRM failure answers 500 and the sale is recorded on a retry.
import { verifyWebhook } from '../lib/stripe.js';
import { recordSale, isCrmConfigured } from '../lib/crm.js';
import { notify, isEmailConfigured } from '../lib/email.js';

const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function handler(event) {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Use POST.' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return reply(500, { error: 'Webhook secret not set' });

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  const header = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
  let stripeEvent;
  try {
    stripeEvent = verifyWebhook(raw, header, secret);
  } catch (err) {
    return reply(400, { error: err.message });
  }

  if (stripeEvent.type !== 'checkout.session.completed') return reply(200, { received: true });
  const s = stripeEvent.data.object;
  if (s.payment_status !== 'paid') return reply(200, { received: true });

  const sale = {
    sessionId: s.id,
    plan: s.metadata?.bas_plan_name || 'Subscription',
    services: s.metadata?.bas_services,
    amount: (s.amount_total || 0) / 100,
    customerName: s.customer_details?.name,
    email: s.customer_details?.email,
    phone: s.customer_details?.phone,
    company: s.custom_fields?.find((f) => f.key === 'company')?.text?.value,
  };

  let opportunityId = null;
  if (isCrmConfigured()) {
    try {
      opportunityId = await recordSale(sale);
      if (opportunityId === null) return reply(200, { received: true, duplicate: true });
    } catch (err) {
      console.error('[stripe-webhook] CRM failed, Stripe will retry:', err.message);
      return reply(500, { error: 'CRM unavailable' });
    }
  }

  if (isEmailConfigured()) {
    try {
      await notify(`New BAS client: ${sale.company || sale.customerName || sale.email} (${sale.plan})`, [
        `Plan: ${sale.plan}`,
        sale.services && `Services: ${sale.services}`,
        `Paid today: $${sale.amount.toFixed(2)} (first month and setup fee)`,
        `Customer: ${[sale.customerName, sale.company, sale.email, sale.phone].filter(Boolean).join(', ')}`,
        '',
        opportunityId ? `Saved in the CRM as a Closed Won opportunity (${opportunityId}).` : 'Not saved to the CRM.',
        'Next: email them within 1 business day to book onboarding.',
      ]);
    } catch (err) {
      console.error('[stripe-webhook] email failed:', err.message);
    }
  }

  return reply(200, { received: true });
}
