// Mobile menu
const toggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('site-nav');

if (toggle && nav) {
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      setOpen(false);
      toggle.focus();
    }
  });
}

// Services drop-down: the arrow opens it (touch, keyboard and the phone menu)
document.querySelectorAll('.nav-group').forEach((group) => {
  const button = group.querySelector('.nav-sub-toggle');
  if (!button) return;
  const setOpen = (open) => {
    group.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!group.classList.contains('open'));
  });
  document.addEventListener('click', (e) => { if (!group.contains(e.target)) setOpen(false); });
  group.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && group.classList.contains('open')) {
      setOpen(false);
      button.focus();
    }
  });
});

// Preselect the "What would you automate first?" option from ?interest=… (used by service page links)
const interest = new URLSearchParams(location.search).get('interest');
const interestSelect = document.getElementById('f-need');
if (interest && interestSelect) {
  const match = [...interestSelect.options].find((o) => o.text === interest);
  if (match) interestSelect.value = match.value;
}

// Keep the footer year current
document.querySelectorAll('[data-year]').forEach((el) => {
  el.textContent = new Date().getFullYear();
});
