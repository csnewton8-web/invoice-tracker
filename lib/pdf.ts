const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

export async function extractPdfText(buffer: Buffer) {
  const uint8 = new Uint8Array(buffer);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8,
    disableWorker: true,
  });

  const pdf = await loadingTask.promise;

  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");

    fullText += pageText + "\n";
  }

  return fullText.trim();
}