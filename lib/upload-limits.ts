export const MAX_INVOICE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_INVOICE_MIME_TYPES = new Set(["application/pdf"]);

export function validateInvoiceFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return "Only PDF files are allowed";
  }

  if (file.type && !ALLOWED_INVOICE_MIME_TYPES.has(file.type)) {
    return "Only PDF files are allowed";
  }

  if (file.size > MAX_INVOICE_FILE_SIZE_BYTES) {
    return "PDF files must be 10 MB or smaller";
  }

  return null;
}
