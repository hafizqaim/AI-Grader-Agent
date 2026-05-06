const path = require("path");
const fs = require("fs");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  BorderStyle,
  AlignmentType,
} = require("docx");

/**
 * Generates a Word (.docx) grade report from the array of graded results.
 * @param {Array<Object>} results - Array of grade result objects from gradeWithAI
 * @returns {Promise<string>} Absolute path to the generated report file
 */
async function generateReport(results) {
  const reportsDir = path.join(__dirname, "..", "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const sections = [];

  for (const result of results) {
    // ── Student name heading ──────────────────────────────────────────────────
    sections.push(
      new Paragraph({
        text: result.studentName || "Unknown Student",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    // ── Summary line ─────────────────────────────────────────────────────────
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Score: ${result.totalScore} / ${result.maxScore}  |  Percentage: ${result.percentage}%  |  Grade: ${result.grade}`,
            bold: true,
          }),
        ],
        spacing: { after: 200 },
      })
    );

    // ── Criteria table ────────────────────────────────────────────────────────
    const headerRow = new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Criterion", bold: true })] })],
          width: { size: 30, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Score", bold: true })], alignment: AlignmentType.CENTER })],
          width: { size: 10, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Max Score", bold: true })], alignment: AlignmentType.CENTER })],
          width: { size: 10, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Feedback", bold: true })] })],
          width: { size: 50, type: WidthType.PERCENTAGE },
        }),
      ],
    });

    const dataRows = (result.criteria || []).map(
      (criterion) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(criterion.name || "")] }),
            new TableCell({
              children: [new Paragraph({ text: String(criterion.score), alignment: AlignmentType.CENTER })],
            }),
            new TableCell({
              children: [new Paragraph({ text: String(criterion.maxScore), alignment: AlignmentType.CENTER })],
            }),
            new TableCell({ children: [new Paragraph(criterion.feedback || "")] }),
          ],
        })
    );

    const table = new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 },
        right: { style: BorderStyle.SINGLE, size: 1 },
        insideH: { style: BorderStyle.SINGLE, size: 1 },
        insideV: { style: BorderStyle.SINGLE, size: 1 },
      },
    });

    sections.push(table);

    // ── Overall comment ───────────────────────────────────────────────────────
    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Overall Comment: ", bold: true }),
          new TextRun(result.overallComment || ""),
        ],
        spacing: { before: 200, after: 400 },
      })
    );
  }

  const doc = new Document({
    sections: [{ children: sections }],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(reportsDir, "grade-report.docx");
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

module.exports = { generateReport };
