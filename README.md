# KewePay

Tanzania payment **sub-gateway**. Merchants use `kp_live_*` API keys; every collection/payout is settled through a **single Snippe** master key.

## Features

- Merchant register / login + dashboard
- Live API keys (`kp_live_…`)
- `POST /v1/payments` → Snippe mobile money
- Snippe webhook intake + status sync loop
- Merchant webhook fan-out (signed)
- Wallet deposit / withdraw (min 100,000 TZS)
- Rate limits, hashed API keys, SSRF-safe webhooks

## Local

```bash
cp .env.example .env
# set MONGODB_URI, SNIPPE_API_KEY, JWT_SECRET
npm install
npm start
```

Open http://localhost:4100

## Deploy on Render

`render.yaml` is included.

1. Push this repo to GitHub.
2. Render → **New** → **Blueprint** (or Web Service) → select `kewepay`.
3. Set secrets (Dashboard → Environment):
   - `MONGODB_URI` (Atlas DB named `kewepay`)
   - `SNIPPE_API_KEY`
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`
   - `PUBLIC_BASE_URL=https://<your-service>.onrender.com`
   - `SNIPPE_WEBHOOK_URL=https://<your-service>.onrender.com/webhooks/snippe`
4. After live, point Snippe webhooks at that HTTPS URL.

Health: `GET /health`

## API

- `POST /auth/register` (name, email, phone, password) · `POST /auth/login` (phone, password)
- `POST /keys` (session) → creates `kp_live_…`
- `POST /v1/payments` (API key)
- `GET /v1/payments/:reference` (API key)
- `POST /webhooks/snippe` (Snippe only)
