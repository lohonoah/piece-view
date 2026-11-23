# Piece View

Piece View is a React, TypeScript, and Vite storefront backed by Supabase. It includes a customer storefront and account area, inventory and order administration, order tracking, and newsletter campaigns.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Start the dev server with `npm run dev`.

## Supabase setup

The checked-in SQL is an incremental schema for the existing Piece View Supabase project. It assumes the base project already has `profiles`, `admin_orders`, `admin_activity`, and the `public.is_admin()` helper; this repository does not include a complete bootstrap for a brand-new Supabase project. Apply the scripts in dependency order: `customer-commerce.sql`, `catalog-admin-management.sql`, `admin-customer-management.sql`, `order-inventory-safety.sql`, `order-tracking-history.sql`, `order-status-tracking-notes.sql`, `paystack-payments.sql`, `marketing-follow-up.sql`, then `order-write-security.sql`. Existing projects should apply only scripts they have not already run.

The order write security migration removes direct customer insert policies for orders and line items. Checkout continues through the `place_customer_order` database function, which calculates prices from the live catalog and reserves stock.

For existing projects that already applied the order tracking notes migration, also apply `supabase/migrations/20261120140000_allow_same_status_tracking_updates.sql`. This allows admins to add customer-visible package location or delivery notes without changing the order status.

Paystack checkout setup, Edge Function deployment, webhook configuration, and secrets are documented in [the function setup guide](supabase/functions/README.md#paystack-checkout).

## Email setup

Newsletter campaigns are sent through the Supabase `send-newsletter` Edge Function and Resend. Follow [the function setup guide](supabase/functions/README.md) for secrets and deployment. Set `NEWSLETTER_FROM` to a verified sender with the brand display name, for example `Piece View <updates@your-domain>`.

Supabase account emails (sign-in, confirmation, and password reset) use the Auth SMTP sender configured in the Supabase Dashboard. Set the sender name to **Piece View** and use a verified sender email/domain there. The application code cannot change the sender name shown by Supabase Auth; see [email branding setup](supabase/EMAIL-BRANDING.md).

## Deploy

The frontend is configured for Vercel. Set the same two `VITE_` variables in the Vercel project, deploy the Edge Functions, and apply pending SQL migrations to the linked Supabase project.
