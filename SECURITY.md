# Security checklist

## Secrets

- Never commit `.env.local` or production secrets.
- Rotate any secrets that were previously shared in a ZIP, screenshot, support chat, or public repository.
- Store production secrets only in the hosting provider secret manager.
- Use separate development, staging, and production Supabase/Stripe/Resend/OpenAI/Azure projects where possible.

## Uploads

- Only PDF uploads are accepted.
- Current server-side limit: 10 MB per invoice PDF.
- Before public launch, add malware scanning for uploaded PDFs and a page-count limit.

## Database and storage

- Apply the Supabase migration in `supabase/migrations`.
- Review Row Level Security policies before production.
- Confirm the `invoices` storage bucket is private.
- Confirm users cannot access another company's invoices or storage objects.

## Payments

- Use Stripe test mode for the full subscription lifecycle before switching to live mode.
- Verify webhook signature validation in production.
- Test checkout, portal, cancellation, failed payment, renewal, and plan downgrade paths.

## Monitoring

- Add application error tracking before launch.
- Add uptime monitoring for the public app and cron endpoints.
- Review logs for failed invoice parsing, failed emails, failed webhooks, and unexpected 500s.
