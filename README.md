# Business Automated Systems — website

Plain HTML/CSS/JS. No build step, nothing to install.

```
site/         ← the website (this folder is what gets published)
  index.html    homepage
  thanks.html   shown after the booking form is sent
  privacy.html  starter privacy policy (fill in [PLACEHOLDERS], have it reviewed)
  css/  js/  assets/
brand/        ← logo files (SVG)
serve.ps1     ← local preview
```

## Preview on this computer

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Open http://localhost:8080. The booking form only really sends once the site is on Netlify; locally it just shows the thank-you page.

## Put it live (about 15 minutes, free)

1. Create a free account at netlify.com.
2. Go to **Sites → Add new site → Deploy manually** and drag the `site` folder onto the page.
3. **Form emails:** Site configuration → Forms → enable form detection, redeploy (drag the folder again), then under Forms → Form notifications add an email notification for the `assessment` form.
4. **Domain:** Domain management → Add a domain → `businessautomatedsystems.com`. Netlify shows the DNS records to add. In GoDaddy: My Products → the domain → DNS → add those records. HTTPS turns on automatically.

To update the site later, drag the `site` folder onto the Deploys page again.
