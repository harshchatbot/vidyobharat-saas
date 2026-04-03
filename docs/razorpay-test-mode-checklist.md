# Razorpay Test Mode Payment Checklist

Use this checklist before inviting paid beta users.

## Goal

Confirm that:
- checkout opens
- payment succeeds
- credits are added once
- billing history updates
- refresh keeps the balance
- webhook backup is ready

## 1. Confirm test-mode config

In Razorpay Dashboard:
- switch to **Test Mode**
- use the **test** `key_id` and `key_secret`
- if testing webhooks, copy the **test-mode** webhook secret into your backend env

In this repo, the relevant backend config keys are defined in:
- `apps/api/app/core/config.py`

Important values:
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

## 2. Start the app locally

Backend:

```bash
cd /Users/harshveersinghnirwan/Downloads/vidyobharat-saas/apps/api
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd /Users/harshveersinghnirwan/Downloads/vidyobharat-saas/apps/web
rm -rf .next
npm run dev
```

Optional worker:

```bash
cd /Users/harshveersinghnirwan/Downloads/vidyobharat-saas/apps/api
source venv/bin/activate
celery -A app.workers.worker.celery_app worker --loglevel=INFO
```

## 3. Open billing

In the browser:
- log in with a test user
- open `/billing`
- note the current wallet balance
- note the most recent billing-history row

## 4. Start a top-up

On `/billing`:
- choose a small plan like `Starter`
- click checkout
- confirm Razorpay Checkout opens

Repo endpoints involved:
- create order: `POST /api/topupCredits/order`
- verify success: `POST /api/topupCredits/verify`
- webhook backup: `POST /api/topupCredits/webhook`

## 5. Complete a success payment

Recommended easiest path: **UPI**

In Razorpay Checkout:
- choose UPI
- use `success@razorpay`

Official docs:
- [Razorpay test UPI IDs](https://razorpay.com/docs/payments/payments/test-upi-details/)

To test a failed payment:
- use `failure@razorpay`

If testing card flow instead:
- use a Razorpay test card
- enter any future expiry date
- enter any random CVV
- complete the mocked success flow

Official docs:
- [Razorpay test cards](https://razorpay.com/docs/payments/payments/test-card-details/)

## 6. Verify app-side success

Immediately after success, confirm:
- success toast appears
- wallet balance increases by the expected credits
- billing history gets a new top-up row
- page refresh keeps the updated balance

Also check backend logs for:
- order creation success
- verify success
- no signature error

## 7. Verify idempotency

Make sure the same payment does **not** add credits twice.

Check one or more of these:
- refresh `/billing` again and confirm balance does not increase a second time
- verify history still shows only one new top-up row
- inspect backend logs and confirm the same provider order is not settled twice

Relevant implementation:
- `apps/api/app/services/credit_service.py`
- `apps/api/app/api/routes.py`

## 8. Optional webhook test

For webhook validation, localhost is not enough. Expose the API on a public URL and configure Razorpay **test-mode** webhook to:

```text
https://<public-host>/api/topupCredits/webhook
```

Then:
- perform another test payment
- confirm webhook delivery succeeds in Razorpay Dashboard
- confirm credits are still applied once only

Useful doc:
- [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/)

## Acceptance Criteria

The payment flow is ready for soft paid beta when:
- checkout opens from `/billing`
- a Razorpay test payment succeeds
- credits are added once
- history reflects the top-up
- refresh keeps the correct balance
- duplicate verify or webhook does not double-credit
- webhook is either verified or intentionally deferred with frontend verify already confirmed working
