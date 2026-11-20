# Piece View email sender branding

There are two email senders to configure:

## Account emails from Supabase Auth

For confirmation, password reset, and sign-in emails, open the Supabase Dashboard for this project and go to **Authentication > SMTP Settings**. Configure a trusted SMTP provider and set:

- Sender name: `Piece View`
- Sender email: an address on a verified Piece View domain, such as `support@your-domain`

Then review the templates under **Authentication > Email Templates** and replace any default project wording with Piece View wording. Use the SMTP provider's verified sender; the display name alone does not verify the domain. Supabase's default mail service may use Supabase-branded sender details and is intended for limited testing.

## Newsletter campaigns from Resend

Set the Supabase Edge Function secret `NEWSLETTER_FROM` to a verified sender with the brand name, such as `Piece View <updates@your-domain>`. Follow [the newsletter function guide](functions/README.md) for the remaining secrets and deployment steps.

The `NEWSLETTER_FROM` setting only controls campaigns sent by the newsletter function. It does not change Supabase Auth email sender details; those are controlled by the Auth SMTP settings above.
