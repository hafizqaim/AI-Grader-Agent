const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { parseFile } = require("../services/parseFile");
const { gradeWithAI } = require("../services/gradeWithAI");
const { generateReport } = require("../services/generateReport");
const { updateNamingFile } = require("../services/updateNamingFile");
const { detectPlagiarism } = require("../services/detectPlagiarism");

const router = express.Router();

// ── Multer configuration ────────────────────────────────────────────────────
const ALLOWED_MIMETYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname}`),
});

const NAMING_FILE_EXTENSIONS = [".xlsx", ".xls", ".csv"];

const fileFilter = (_req, file, cb) => {
  if (file.fieldname === "namingFile") {
    const ext = path.extname(file.originalname).toLowerCase();
    if (NAMING_FILE_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(`Naming file must be .xlsx, .xls, or .csv`),
        false
      );
    }
  } else if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File "${file.originalname}" is not a supported format. Only PDF and DOCX files are accepted.`
      ),
      false
    );
  }
};

const upload = multer({ storage, fileFilter });

const uploadFields = upload.fields([
  { name: "task", maxCount: 1 },
  { name: "submissions", maxCount: 30 },
  { name: "rubric", maxCount: 1 },
  { name: "namingFile", maxCount: 1 },
]);

// ── POST /api/grade ─────────────────────────────────────────────────────────
router.post("/grade", uploadFields, async (req, res) => {
  try {
    const taskFile = req.files?.task?.[0];
    const rubricFile = req.files?.rubric?.[0];
    const submissionFiles = req.files?.submissions || [];

    if (!taskFile) {
      return res.status(400).json({ error: "Assignment task file is required." });
    }
    if (!rubricFile) {
      return res.status(400).json({ error: "Grading rubric file is required." });
    }
    if (submissionFiles.length === 0) {
      return res.status(400).json({ error: "At least one student submission is required." });
    }

    const namingFile = req.files?.namingFile?.[0];
    if (!namingFile) {
      return res.status(400).json({ error: "Naming file (Excel/CSV) is required." });
    }

    const markColumn = parseInt(req.body.markColumn, 10);
    if (isNaN(markColumn) || markColumn < 1) {
      return res.status(400).json({ error: "markColumn must be a positive integer (1-based column number)." });
    }
    // Convert to 0-based index
    const markColumnIndex = markColumn - 1;

    // Parse task and rubric
    const [taskText, rubricText] = await Promise.all([
      parseFile(taskFile.path, taskFile.mimetype),
      parseFile(rubricFile.path, rubricFile.mimetype),
    ]);

    // Parse all submission texts first (needed for both grading and plagiarism)
    const submissionData = await Promise.all(
      submissionFiles.map(async (file) => ({
        name: path.basename(file.originalname, path.extname(file.originalname)),
        text: await parseFile(file.path, file.mimetype),
        file,
      }))
    );

    // Run plagiarism detection (pure text comparison, no AI call needed)
    const plagiarism = detectPlagiarism(
      submissionData.map((s) => ({ name: s.name, text: s.text }))
    );

    // Grade all submissions in parallel; student name = filename without extension
    const gradingPromises = submissionData.map(({ name, text }) =>
      gradeWithAI({ taskText, submissionText: text, rubricText, studentName: name })
    );

    const grades = await Promise.all(gradingPromises);

    // Generate the DOCX report and update the naming file with marks
    await Promise.all([
      generateReport(grades),
      updateNamingFile(namingFile.path, grades, markColumnIndex),
    ]);

    return res.json({ grades, plagiarism });
  } catch (err) {
    console.error("Grading error:", err);
    return res.status(500).json({ error: err.message || "An unexpected error occurred." });
  }
});

// ── GET /api/download ───────────────────────────────────────────────────────
router.get("/download", (_req, res) => {
  const reportPath = path.join(__dirname, "..", "reports", "grade-report.docx");
  if (!fs.existsSync(reportPath)) {
    return res.status(404).json({ error: "No report available. Please grade submissions first." });
  }
  res.download(reportPath, "grade-report.docx");
});

// ── GET /api/download-marks ──────────────────────────────────────────────────
router.get("/download-marks", (_req, res) => {
  const marksPath = path.join(__dirname, "..", "reports", "updated-marks.xlsx");
  if (!fs.existsSync(marksPath)) {
    return res.status(404).json({ error: "No marks file available. Please grade submissions first." });
  }
  res.download(marksPath, "updated-marks.xlsx");
});

module.exports = router;
