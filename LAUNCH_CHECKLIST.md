# SaaS launch checklist

## Must complete before taking payment

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `.env.local`, `.git`, `.next`, and `node_modules` are not included in shared/deployed ZIPs.
- [ ] All exposed secrets have been rotated.
- [ ] Supabase migration has been applied to a clean database.
- [ ] RLS and storage policies have been manually tested with two separate companies.
- [ ] Stripe checkout, billing portal, webhooks, cancellation, failed payment, and renewal are tested.
- [ ] Upload limits are enforced server-side.
- [ ] Production error tracking and uptime monitoring are configured.
- [ ] Terms, Privacy Policy, cookie notice, and data deletion/account deletion process exist.

## Strongly recommended before public launch

- [ ] Team invitation flow.
- [ ] Member management UI.
- [ ] Audit log UI.
- [ ] Admin/support dashboard.
- [ ] Automated tests for auth, invoice CRUD, billing, and reminders.
- [ ] Malware scanning/page-count limit for uploaded PDFs.
- [ ] Backup and restore runbook.
- [ ] Staging environment.

## Later improvements

- [ ] Usage analytics dashboard.
- [ ] Multi-currency reporting.
- [ ] Supplier/vendor management.
- [ ] Export to CSV/Xero/QuickBooks.
- [ ] More robust invoice extraction validation workflow.
