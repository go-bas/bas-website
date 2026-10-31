// The one place BAS services and prices live. The website, the ROI calculator,
// the price table, the checkout page and the server's Stripe prices all read
// this file. Change a price here and Stripe gets a matching new price on the
// next checkout (the lookup key includes the amount).

export const SERVICES = [
  { id: 'books', page: 'bookkeeping',    name: 'Bookkeeping',                role: 'Bookkeeper',               wage: 30, hours: 20, price: 349, included: 'Up to 300 transactions a month, 2 accounts', on: true },
  { id: 'social', page: 'social-media',   name: 'Social media',               role: 'Social media coordinator', wage: 25, hours: 15, price: 299, included: '12 posts a month on up to 3 networks', on: true },
  { id: 'phones', page: 'ai-receptionist',   name: 'AI receptionist',            role: 'Receptionist',             wage: 20, hours: 40, price: 399, included: '500 call minutes, then $0.25 a minute', on: true },
  { id: 'outbound', page: 'outbound-calling', name: 'Outbound follow-up calls',   role: 'Appointment setter',       wage: 22, hours: 20, price: 299, included: '300 call minutes, then $0.25 a minute', on: false },
  { id: 'mkt', page: 'marketing-automation',      name: 'Marketing automation',       role: 'Marketing assistant',      wage: 28, hours: 10, price: 249, included: '2 campaigns and 5,000 emails a month', on: false },
  { id: 'docs', page: 'document-review',     name: 'Contract & document review', role: 'Paralegal time',           wage: 35, hours: 4,  price: 199, included: '10 documents a month', on: false },
  { id: 'admin', page: 'admin-assistant',    name: 'Admin assistant',            role: 'Administrative assistant', wage: 22, hours: 20, price: 249, included: '1 inbox and calendar', on: false },
];

export const GROWTH = { id: 'growth', name: 'Growth bundle', price: 899, covers: 3 };
export const FULL_OFFICE = { id: 'full', name: 'Full Office bundle', price: 1799 };
export const SETUP_FEE = { id: 'setup', name: 'One-time setup', price: 499 };

/** Every plan a client can buy at checkout: each single service, then the bundles. */
export function plans() {
  return [
    ...SERVICES.map((s) => ({ id: s.id, name: s.name, price: s.price, picks: 0 })),
    { id: GROWTH.id, name: GROWTH.name, price: GROWTH.price, picks: GROWTH.covers },
    { id: FULL_OFFICE.id, name: FULL_OFFICE.name, price: FULL_OFFICE.price, picks: 0 },
  ];
}

export function findPlan(id) {
  return plans().find((p) => p.id === id) || null;
}
