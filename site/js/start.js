import { SERVICES, SETUP_FEE, plans, findPlan } from './services.js';

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const form = document.getElementById('start-form');
const status = document.getElementById('start-status');
const pickGroup = document.getElementById('pick-group');

document.getElementById('plan-options').innerHTML = plans().map((p) => `
  <label class="choice">
    <input type="radio" name="plan" value="${p.id}">
    <span><strong>${p.name}</strong><small>${p.picks ? `Any ${p.picks} services` : p.id === 'full' ? 'All 7 services' : SERVICES.find((s) => s.id === p.id).included}</small></span>
    <span class="choice-price">${money(p.price)}/mo</span>
  </label>`).join('');

document.getElementById('pick-options').innerHTML = SERVICES.map((s) => `
  <label class="choice">
    <input type="checkbox" name="services" value="${s.id}">
    <span><strong>${s.name}</strong><small>${s.included}</small></span>
  </label>`).join('');

const requested = new URLSearchParams(location.search).get('plan');
const initial = findPlan(requested) ? requested : 'growth';
form.querySelector(`[name=plan][value="${initial}"]`).checked = true;

function update() {
  const plan = findPlan(form.plan.value);
  const picked = [...form.querySelectorAll('[name=services]:checked')];
  pickGroup.hidden = !plan.picks;
  if (plan.picks) {
    document.getElementById('pick-count').textContent = `${picked.length} of ${plan.picks} picked`;
    form.querySelectorAll('[name=services]').forEach((box) => {
      box.disabled = !box.checked && picked.length >= plan.picks;
    });
  }
  document.getElementById('s-monthly').textContent = money(plan.price);
  document.getElementById('s-today').textContent = money(plan.price + SETUP_FEE.price);
  status.textContent = '';
}

form.addEventListener('change', update);
update();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const plan = findPlan(form.plan.value);
  const services = [...form.querySelectorAll('[name=services]:checked')].map((b) => b.value);
  if (plan.picks && services.length !== plan.picks) {
    status.textContent = `Please pick ${plan.picks} services for the ${plan.name}.`;
    return;
  }

  const button = document.getElementById('start-btn');
  button.disabled = true;
  status.textContent = 'Opening secure checkout…';
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: plan.id, services: plan.picks ? services : [] }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.url) throw new Error(json.error || 'Sorry, checkout is not available just now.');
    location.href = json.url;
  } catch (err) {
    status.textContent = err.message;
    button.disabled = false;
  }
});

