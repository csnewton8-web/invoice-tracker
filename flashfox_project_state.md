# FlashFox Project State

## Overview

FlashFox is a SaaS invoice management platform for SMEs.

Target market:

* Manufacturing
* Engineering
* Fabrication
* Construction
* SMEs (5–100 employees)

Tech stack:

* Next.js
* TypeScript
* Supabase
* Vercel
* Resend

---

## Core Features Completed

### Invoice Uploads

* PDF upload
* OCR extraction
* Invoice metadata extraction
* Supplier detection
* Payment status tracking

### Invoice Workspace

* Invoice table
* Invoice detail panel
* Invoice viewer
* Search and filtering

### Duplicate Detection

* SHA256 PDF fingerprinting
* Exact PDF duplicates blocked
* Duplicate upload warning shown to user

### Email Ingestion

* [invoices@flashfox.co.uk](mailto:invoices@flashfox.co.uk)
* Resend inbound email processing
* PDF attachment extraction
* Automatic invoice creation

### Approved Forwarding Senders

Table:

* email_forwarding_senders

Features:

* Add forwarding email
* Remove forwarding email
* Approved sender validation

### Email Import History

Table:

* email_imports

Statuses:

* imported
* duplicate
* unknown_sender
* no_pdf
* failed

Settings page includes:

* Forwarding senders
* Email import history
* Open Invoice button

### Audit Logs

* Invoice upload logging
* Email import logging

---

## Current Infrastructure

Domain:

* flashfox.co.uk

Inbound Email:

* [invoices@flashfox.co.uk](mailto:invoices@flashfox.co.uk)

MX:

* inbound-smtp.eu-west-1.amazonaws.com

Provider:

* Resend

Hosting:

* Vercel

Database:

* Supabase

Storage:

* Supabase Storage

---

## Current Database Tables

companies
company_members
invoices
invoice_reminders
audit_logs
email_forwarding_senders
email_imports

---

## Current Priorities

### Priority 1

Add sender email column to Email Import History

### Priority 2

Dashboard metrics:

* Email imported invoices
* Manual uploaded invoices
* Automation percentage

### Priority 3

Onboarding:

* Upload first invoice
* Add forwarding sender
* Create forwarding rule
* Send test invoice

### Priority 4

Supplier analytics

### Priority 5

Invoice approval workflows

---

## Future Roadmap

### Accounts Payable Platform

Invoice Capture
→ Approval
→ Payment Tracking
→ Supplier Analytics
→ Reporting

Not just OCR.

---

## Important Notes

InvoiceWorkspace uses:

URL parameter:
invoiceId

Example:
/invoices?invoiceId=<invoice_id>

Email Import History Open Invoice button must use:
invoiceId

NOT:
invoice

---

## Last Completed Feature

Email Import History working:

* Sender validation
* Import logging
* Open Invoice button
* Duplicate detection
* Resend inbound processing
