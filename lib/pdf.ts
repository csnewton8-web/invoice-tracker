const pdfParse = require("pdf-parse");

export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data?.text || "";
  } catch (err) {
    console.error("PDF parse error:", err);
    return "";
  }
}