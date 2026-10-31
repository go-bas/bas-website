# Business Automated Systems — website

Plain HTML/CSS/JS with three small Netlify functions. No build step, nothing to install.

```
site/                    ← the website (what gets published)
  index.html               homepage: a short introduction pointing to the pages below
  services.html            all services (each also has its own page in services/)
  savings.html             savings calculator
  pricing.html             plans and single-service prices
  contact.html             booking form (Netlify Forms; also sent to the YPS CRM)
  start.html               choose a plan, then pay through Stripe
  welcome.html             shown after a client pays
  thanks.html              shown after the booking form is sent
  privacy.html             starter privacy policy (fill in [PLACEHOLDERS], have it reviewed)
  services/                one page per service
  js/services.js           ALL services and prices (calculator, price table, checkout and Stripe read this)
  css/  js/  assets/
netlify/functions/       ← run on Netlify
  submission-created.js    each booking form request also becomes a Lead in the YPS CRM
  checkout.js              /api/checkout: starts a Stripe Checkout
  stripe-webhook.js        /api/stripe-webhook: a paid checkout becomes a Closed Won deal in the CRM, and emails you
netlify/lib/             ← CRM, Stripe and email helpers
tests/                   ← offline tests (npm test)
brand/                   ← logo files (SVG)
serve.ps1                ← local preview (pages only)
```

## Changing prices

Edit `site/js/services.js`. The calculator, the price table, the checkout page and
Stripe all follow: the next checkout creates a matching Stripe price on its own.
Existing subscribers keep the price they signed up at.

## Preview on this computer

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Open http://localhost:8080. Pages and the calculator work locally; the booking form,
checkout and CRM only work once the site is on Netlify.

## Put it live

The functions need Netlify to deploy **from GitHub**. Dragging the `site` folder
onto Netlify publishes the pages but not the functions.

1. **Netlify:** Add new site → **Import an existing project** → GitHub → `go-bas/bas-website`.
   Netlify reads `netlify.toml`, so leave the build settings as they are. Deploy.
   (If you already made a site by dragging the folder, use that site's
   Site configuration → Build & deploy → **Link repository** instead, so the domain stays.)
2. **Booking form emails:** Site configuration → Forms → enable form detection, then
   Forms → Form notifications → add an email notification for the `assessment` form.
3. **Settings** (Site configuration → Environment variables). Type them into Netlify only,
   never into a chat or a file:
   - `SUITECRM_BASE_URL`, `SUITECRM_API_USER`, `SUITECRM_API_PASSWORD`: copy from the YPS project's settings.
   - `STRIPE_SECRET_KEY`: the BAS Stripe account → Developers → API keys. Start with the test key (`sk_test_…`).
   - `STRIPE_WEBHOOK_SECRET`: Stripe → Developers → Webhooks → Add endpoint
     `https://businessautomatedsystems.com/api/stripe-webhook`, event `checkout.session.completed`;
     copy its signing secret (`whsec_…`).
   - `RESEND_API_KEY` (copy from YPS) and `BAS_NOTIFY_EMAIL` (your inbox) for new-client emails.
   - Optional: `SITE_URL=https://businessautomatedsystems.com`.

   Then Deploys → Trigger deploy, so the settings take effect.
4. **Domain:** Domain management → Add a domain → `businessautomatedsystems.com`. Netlify
   shows the DNS records to add. In GoDaddy: My Products → the domain → DNS → add those
   records. HTTPS turns on automatically.
5. **Test:** send the booking form and check the CRM and your inbox. Buy a plan with
   Stripe's test card `4242 4242 4242 4242` and check the CRM for a Closed Won deal.
   Then switch Stripe to the live key and redeploy.

Each part switches on by itself once its settings are present. Until Stripe is set,
the checkout page says online checkout isn't on yet and points people to the booking form.

## Still to fill in

- **Client service agreement:** have the partner attorney write it, then add it as the
  Terms of Service link in Stripe (Settings → Public details) so clients agree at checkout.
- **Privacy policy:** the `[PLACEHOLDERS]` in `privacy.html`, reviewed by the attorney.

## Tests

```
npm test    # offline: no keys needed
```
