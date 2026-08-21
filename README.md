# KewePay

Your payment gateway for Tanzania. Merchants use **KewePay** API keys; every collection is settled through **Snippe**.

This project is **separate from UnlockVIP** (`unlockvip-backend`). Do not deploy them as one service.

## Features

- Merchant register / login
- Live API keys (`kp_live_…`)
- `POST /v1/payments` mobile money collection via Snippe
- Snippe webhook intake → merchant webhook fan-out
- Dashboard: volume, fees, keys, transactions
- Platform fee (`PLATFORM_FEE_PERCENT`)
- Admin bootstrap user

## Quick start

```bash
cp .env.example .env
# set MONGODB_URI, SNIPPE_API_KEY, JWT_SECRET
npm install
npm run dev
```

Open http://localhost:4100

Default admin (first boot):

- email: `admin@kewepay.local`
- password: `ChangeMe123!` (change via env)

## Important

Use a **dedicated MongoDB database** (default name `kewepay`) so UnlockVIP data is never touched.

Prefer a **separate Snippe API key** for KewePay in production so UnlockVIP and KewePay balances/history stay clean.

## Deploy (Render)

1. Create a **new** Web Service from this repo (not UnlockVIP).
2. Set env vars from `.env.example`.
3. Start command: `npm start`
4. Set `PUBLIC_BASE_URL` to the Render URL.

## API

See in-app **Docs** (`#/docs`) or call:

- `POST /auth/register`
- `POST /auth/login`
- `POST /keys` (session)
- `POST /v1/payments` (API key)
- `GET /v1/payments/:reference` (API key)
