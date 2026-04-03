# Soft Paid Beta Launch Checklist

## Positioning
- Position RangManch as an India-first creator workflow studio.
- Lead with images, templates, influencer visuals, and Kling-based draft video workflows.
- Treat Veo 3.1 and Sora 2 as premium paths, not the default promise.

## Required Launch Gates
- `cd apps/web && npm run build`
- Run stable Playwright suites and require them green:
  - `npx playwright test tests/e2e/public-smoke.spec.ts tests/e2e/image-studio-smoke.spec.ts tests/e2e/video-studio-smoke.spec.ts tests/e2e/templates-smoke.spec.ts tests/e2e/influencer-smoke.spec.ts`
- Do one manual mobile pass on:
  - landing
  - image studio
  - video studio
  - influencer studio
  - pricing
  - billing
- Do one production-like workflow pass:
  - generate one image
  - generate one video
  - generate one influencer visual

## Payments and Credits
- Run one Razorpay test-mode purchase end to end before inviting paid beta users.
- Verify:
  - checkout completes
  - credits are added once
  - wallet refresh persists the updated balance
  - credit history shows the top-up entry
  - duplicate callback or webhook does not double-credit

## Environment Checks
- Verify production values for:
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_API_FALLBACK_URL`
  - Firebase auth config
  - Razorpay key and webhook secret
- Confirm API health and image/video fetches work without timeout loops.

## Language Promise
- Regional language coverage is broad enough for beta launch.
- Punjabi and Odia now have fallback language mappings for non-Sarvam TTS.
- Keep public messaging honest: regional voices are supported, but provider health still matters.

## Beta Metrics To Watch
- visitor to signup
- signup to first generated asset
- signup to first saved or downloaded usable asset
- 7-day return rate
- free to paid conversion
- first workflow used:
  - image
  - template
  - influencer
  - video
