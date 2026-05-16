const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

/**
 * Reads the uploaded naming file (Excel/CSV), finds rows whose first-column
 * value matches a submitted roll number, and writes the totalScore into the
 * user-specified column.
 *
 * @param {string} namingFilePath  - Path to the uploaded naming file
 * @param {Array}  results         - Array of grade result objects (studentName = roll number)
 * @param {number} markColumnIndex - 0-based column index where marks should be written
 * @returns {Promise<string>} Absolute path to the updated file saved under /reports/
 */
async function updateNamingFile(namingFilePath, results, markColumnIndex) {
  const workbook = XLSX.readFile(namingFilePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert sheet to array-of-arrays so row/column indexing is straightforward
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // Build a lookup map: ROLL_NUMBER (uppercased) → totalScore
  const scoreMap = {};
  for (const result of results) {
    const roll = String(result.studentName || "").trim().toUpperCase();
    if (roll) scoreMap[roll] = result.totalScore;
  }

  // Walk every row and fill in the mark where the roll number matches
  for (const row of data) {
    const rollNo = String(row[0] || "").trim().toUpperCase();
    if (rollNo && scoreMap[rollNo] !== undefined) {
      // Pad the row if the target column doesn't exist yet
      while (row.length <= markColumnIndex) {
        row.push("");
      }
      row[markColumnIndex] = scoreMap[rollNo];
    }
  }

  // Write the updated data back to the first sheet
  const updatedSheet = XLSX.utils.aoa_to_sheet(data);
  workbook.Sheets[sheetName] = updatedSheet;

  const outputDir = path.join(__dirname, "..", "reports");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "updated-marks.xlsx");
  XLSX.writeFile(workbook, outputPath);
  return outputPath;
}

module.exports = { updateNamingFile };
