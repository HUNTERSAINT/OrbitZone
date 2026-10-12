# Orbit Zone

Orbit Zone is an adults-only, mobile-first dating app for Lokoja residents: **Where Lokoja meets.**

## Run in Replit

The workspace uses pnpm and has separate web and API workflows. Install packages with `pnpm install`, apply the development schema with `pnpm --filter @workspace/db run push`, then start the `artifacts/api-server: API Server` and `artifacts/confluence: web` workflows. The API health check is available at `/api/healthz`.

## Environment and secrets

Set these in Replit Secrets; never commit them:

- `SESSION_SECRET` — long, random value for signed sessions.
- `PAYSTACK_PUBLIC_KEY` and `PAYSTACK_SECRET_KEY` — Paystack test keys for development. Use live keys only in a separately configured production environment.
- `DATABASE_URL` is provided by the workspace database environment. Photo uploads use the configured Replit object storage service.

In Paystack, register the server webhook at `https://<your-app-domain>/api/payments/webhook`. Payment access is granted only after the server verifies the Paystack transaction and amount; a browser redirect alone does not activate a plan.

## Local demo accounts

The demo seed includes one admin, a free male account, a Premium male account, and two women who have explicitly selected different search preferences. The included sample photos are generated assets, not real member photos.

For a development-only seed, set these secrets:

- `ORBITZONE_ADMIN_PASSWORD` — password for `admin@orbitzone.test`.
- `ORBITZONE_DEMO_PASSWORD` — shared password for `demo.free@orbitzone.test`, `demo.premium@orbitzone.test`, `demo.ada@orbitzone.test`, and `demo.zainab@orbitzone.test`.

Then run `ALLOW_DEMO_SEED=true pnpm run seed:demo`. Both passwords must be at least 12 characters. The seed is idempotent, does not overwrite existing accounts, and intentionally refuses to run in production.

## Production notes

Before launching publicly, configure production database and object-storage access, use live Paystack keys, register the production webhook, and review the Terms, Privacy Notice, contact details, and moderation procedures. The test checkout credentials are not suitable for live payments.
