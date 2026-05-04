const fs = require("fs");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

/**
 * Extracts plain text from a PDF or DOCX file.
 * @param {string} filePath - Absolute path to the uploaded file
 * @param {string} mimetype - MIME type of the file
 * @returns {Promise<string>} Extracted text content
 */
async function parseFile(filePath, mimetype) {
  if (mimetype === "application/pdf") {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  if (
    mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error(
    `Unsupported file type: ${mimetype}. Only PDF and DOCX files are accepted.`
  );
}

module.exports = { parseFile };
