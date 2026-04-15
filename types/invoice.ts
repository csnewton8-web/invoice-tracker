export type InvoiceRecord = {
  id: string;
  user_id: string;
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  total: number | null;
  currency: string | null;
  confidence: number | null;
  extraction_method: string | null;
  fingerprint: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  raw_text: string | null;
  notes: string[];
  is_paid: boolean;
  created_at: string;
  updated_at: string;
};

export type ExtractedInvoice = {
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  total: number | null;
  currency: string | null;
  confidence: number;
  extraction_method: "ai" | "ocr+ai" | "rules";
  notes: string[];
};
