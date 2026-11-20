# Resend newsletter setup

Newsletter signup, subscriber export, campaign sending, and unsubscribe are implemented. Before campaign sending can work:

1. Verify a sending domain in Resend.
2. In Supabase project settings, add these Edge Function secrets:
   - `RESEND_API_KEY`: a Resend API key with permission to send email.
   - `NEWSLETTER_FROM`: a sender such as `Piece View <updates@your-verified-domain>`.
   - `SITE_URL`: `https://piece-view.vercel.app`.
3. Deploy the `send-newsletter` and `newsletter-unsubscribe` Edge Functions.

Keep the Resend API key in Supabase secrets. Never add it to the Vite app, a checked-in `.env` file, or Git.

This setting brands newsletter campaigns only. For branded sign-in, confirmation, and password reset emails, configure the Supabase Auth SMTP sender name as `Piece View` in the project Dashboard. See [email branding setup](../EMAIL-BRANDING.md).

## Paystack checkout

Online checkout uses Paystack's hosted checkout. The secret key stays in Supabase Edge Function secrets; the browser receives only Paystack's authorization URL. Set these secrets in the Supabase project:

- `PAYSTACK_SECRET_KEY`: Paystack test key for staging, live key only after testing.
- `PAYSTACK_WEBHOOK_SECRET`: Paystack webhook signing secret (`whsec_...`). The webhook also supports the legacy `x-paystack-signature` while migrating.
- `SITE_URL`: the public storefront origin, such as `https://piece-view.vercel.app`.

Apply `supabase/paystack-payments.sql`, deploy `paystack-initialize`, `paystack-verify`, and `paystack-webhook`, then set the Paystack webhook URL to `https://<project-ref>.supabase.co/functions/v1/paystack-webhook`. Enable `charge.success` and `charge.failed`. The callback verifies transactions directly with Paystack, and the webhook verifies again before updating order payment state or releasing reserved stock.

Use Paystack test keys and test transactions first. A successful payment changes the order's payment state to Paid; fulfillment status remains Pending until an administrator processes the order.
