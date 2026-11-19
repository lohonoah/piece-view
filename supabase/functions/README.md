# Resend newsletter setup

Newsletter signup, subscriber export, campaign sending, and unsubscribe are implemented. Before campaign sending can work:

1. Verify a sending domain in Resend.
2. In Supabase project settings, add these Edge Function secrets:
   - `RESEND_API_KEY`: a Resend API key with permission to send email.
   - `NEWSLETTER_FROM`: a sender such as `Piece View <updates@your-verified-domain>`.
   - `SITE_URL`: `https://piece-view.vercel.app`.
3. Deploy the `send-newsletter` and `newsletter-unsubscribe` Edge Functions.

Keep the Resend API key in Supabase secrets. Never add it to the Vite app, a checked-in `.env` file, or Git.
