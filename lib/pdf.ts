export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Temporarily disabled because the current pdf-parse package crashes in Next.js
    // with: ReferenceError: DOMMatrix is not defined.
    //
    // Returning an empty string safely forces the upload flow to use AI PDF
    // extraction instead of crashing the route.
    return "";
  } catch (err) {
    console.error("PDF parse error:", err);
    return "";
  }
}