// Homepage: the savings calculator, the single-service price table, and the
// calculator summary sent with the assessment form. Prices come from services.js.
import { SERVICES, GROWTH, FULL_OFFICE } from './services.js';

const WEEKS_PER_MONTH = 4.33;
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const signed = (n) => (n >= 0 ? money(n) : '−' + money(-n));

// The cheapest way to buy the chosen services: one by one, Growth (the 3
// priciest in the bundle, the rest one by one) or Full Office.
function bestPlan(prices) {
  const sorted = [...prices].sort((a, b) => b - a);
  const total = sorted.reduce((s, p) => s + p, 0);
  const options = [{ label: sorted.length === 1 ? 'single service' : 'services billed separately', cost: total }];
  if (sorted.length >= GROWTH.covers) {
    const rest = sorted.slice(GROWTH.covers).reduce((s, p) => s + p, 0);
    options.push({ label: rest ? `${GROWTH.name} + extras` : GROWTH.name, cost: GROWTH.price + rest });
  }
  if (sorted.length) options.push({ label: FULL_OFFICE.name, cost: FULL_OFFICE.price });
  return options.reduce((best, o) => (o.cost < best.cost ? o : best));
}

const rows = document.getElementById('roi-rows');
const form = document.getElementById('roi-form');

if (rows && form) {
  rows.innerHTML = SERVICES.map((s) => `
    <div class="calc-row" data-id="${s.id}">
      <label class="calc-service">
        <input type="checkbox" name="on" ${s.on ? 'checked' : ''}>
        <span><strong>${s.name}</strong><small>Replaces: ${s.role}</small></span>
      </label>
      <label class="calc-field"><span class="calc-label">Hourly wage</span>
        <span class="input-affix"><span>$</span><input name="wage" type="number" min="0" step="0.5" value="${s.wage}" inputmode="decimal" aria-label="${s.name}: hourly wage"></span>
      </label>
      <label class="calc-field"><span class="calc-label">Hours a week</span>
        <input name="hours" type="number" min="0" max="80" step="1" value="${s.hours}" inputmode="numeric" aria-label="${s.name}: hours a week">
      </label>
      <span class="calc-field"><span class="calc-label">Staff cost a month</span><output name="cost">$0</output></span>
      <span class="calc-field"><span class="calc-label">BAS price</span><span class="calc-price">${money(s.price)}/mo</span></span>
    </div>`).join('');

  const calculate = () => {
    const burden = 1 + Math.max(0, Number(document.getElementById('roi-burden').value) || 0) / 100;
    let staff = 0;
    const prices = [];
    const chosen = [];
    rows.querySelectorAll('.calc-row').forEach((row) => {
      const service = SERVICES.find((s) => s.id === row.dataset.id);
      const on = row.querySelector('[name=on]').checked;
      const wage = Math.max(0, Number(row.querySelector('[name=wage]').value) || 0);
      const hours = Math.max(0, Number(row.querySelector('[name=hours]').value) || 0);
      const cost = wage * hours * WEEKS_PER_MONTH * burden;
      row.querySelector('[name=cost]').textContent = money(cost);
      row.classList.toggle('off', !on);
      if (on) {
        staff += cost;
        prices.push(service.price);
        chosen.push(service.name);
      }
    });

    const plan = prices.length ? bestPlan(prices) : { label: 'nothing selected', cost: 0 };
    const save = staff - plan.cost;
    document.getElementById('r-staff').textContent = money(staff);
    document.getElementById('r-bas').textContent = money(plan.cost);
    document.getElementById('r-plan').textContent = `a month · ${plan.label}`;
    document.getElementById('r-save').textContent = signed(save);
    document.getElementById('r-year').textContent = `a month · ${signed(save * 12)} a year`;
    document.getElementById('r-roi').textContent = plan.cost ? (Math.max(0, save) / plan.cost).toFixed(1) + '×' : '0×';

    // Sent with the assessment form so the request arrives with the numbers.
    const hidden = document.getElementById('f-savings');
    if (hidden) {
      hidden.value = chosen.length
        ? `${chosen.join(', ')}. Staff cost ${money(staff)}/mo, BAS ${money(plan.cost)}/mo, saves ${signed(save)}/mo.`
        : '';
    }
  };

  calculate();
  form.addEventListener('input', calculate);
  form.addEventListener('submit', (e) => e.preventDefault());
}

const priceRows = document.getElementById('price-rows');
if (priceRows) {
  priceRows.innerHTML = SERVICES.map(
    (s) => `<tr><th scope="row"><a href="services/${s.page}.html">${s.name}</a></th><td>${money(s.price)}</td><td>${s.included}</td></tr>`
  ).join('');
}
