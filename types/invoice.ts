export type InvoiceRecord = {
  id: string;

  user_id?: string | null;
  company_id?: string | null;

  file_name?: string | null;

  supplier?: string | null;
  invoice_number?: string | null;
  po_number?: string | null;

  invoice_date?: string | null;
  due_date?: string | null;

  total?: number | null;
  currency?: string | null;

  is_paid?: boolean | null;

  review_status?:
    | "pending_review"
    | "approved"
    | "needs_attention"
    | null;

  reviewed_at?: string | null;
  reviewed_by?: string | null;

  duplicate_of_invoice_id?: string | null;
  duplicate_confidence?: number | null;
  duplicate_status?:
    | "none"
    | "possible"
    | "confirmed"
    | "dismissed"
    | null;

  archived_at?: string | null;

  notes?: string[] | null;

  created_at?: string | null;
  updated_at?: string | null;
};