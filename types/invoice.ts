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
  notes?: string[] | null;

  created_at?: string | null;
  updated_at?: string | null;
};