# Playwright smoke tests

This suite is the starting point for browser-level QA in the web app.

Current scope:
- landing page
- pricing page
- login
- signup

Run locally:

```bash
cd apps/web
npx playwright install chromium
npm run test:e2e
```

Useful variants:

```bash
cd apps/web
npm run test:e2e:headed
npm run test:e2e:ui
```

Next expansion targets:
- billing top-up flow
- image studio
- video create flow
- influencer studio
- templates browser
