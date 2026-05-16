const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

/**
 * Extracts plain text from a PDF or DOCX file.
 * Falls back to extension-based detection when the browser sends a generic
 * mimetype such as application/octet-stream (common on Windows).
 * @param {string} filePath  - Absolute path to the uploaded file
 * @param {string} mimetype  - MIME type reported by the browser
 * @returns {Promise<string>} Extracted text content
 */
async function parseFile(filePath, mimetype) {
  const ext = path.extname(filePath).toLowerCase();

  const isPDF =
    mimetype === "application/pdf" || ext === ".pdf";

  const isDOCX =
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx";

  if (isPDF) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  if (isDOCX) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error(
    `Unsupported file type: ${mimetype} (${ext}). Only PDF and DOCX files are accepted.`
  );
}

module.exports = { parseFile };
