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

// ── Fix 2: Concurrency limiter ───────────────────────────────────────────────
// Mistral free tier: force 1 (API is rate-limited; parallel calls just hit 429)
// Ollama: respect OLLAMA_CONCURRENCY (1 local, 3 for Colab)
const CONCURRENCY_LIMIT = process.env.MISTRAL_API_KEY
  ? 1
  : parseInt(process.env.OLLAMA_CONCURRENCY || "1", 10);

async function limitedParallel(items, asyncFn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await asyncFn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── Fix 7: Delete a file silently after use ──────────────────────────────────
function deleteFile(filePath) {
  try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
}

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
const ALLOWED_EXTENSIONS    = [".pdf", ".docx"];

// Use extension-based checking as primary signal — browser mimetypes on Windows
// are unreliable (DOCX often arrives as application/octet-stream).
const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === "namingFile") {
    if (NAMING_FILE_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Naming file must be .xlsx, .xls, or .csv`));
    }
  } else {
    if (ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(
        `File "${file.originalname}" is not supported. Only PDF and DOCX files are accepted.`
      ));
    }
  }
};

const upload = multer({ storage, fileFilter });

// ── Fix: use upload.any() to avoid LIMIT_UNEXPECTED_FILE from multer's
// shared filesLeft counter bug in 1.4.x. Field names are validated manually.
function makeUploadMiddleware() {
  return upload.any();
}

// ── POST /api/grade ─────────────────────────────────────────────────────────
router.post("/grade", (req, res, next) => {
  console.log("[grade] multer middleware starting...");
  makeUploadMiddleware()(req, res, (err) => {
    console.log("[grade] multer callback fired, err =", err || "none");
    if (!err) return next();
    // Translate multer errors into clean JSON before they reach the global handler
    const msg = err.code === "LIMIT_UNEXPECTED_FILE"
      ? `Unexpected file field "${err.field}". Check that your form fields are named correctly.`
      : err.message || "File upload error.";
    console.error("[grade] multer error:", msg);
    return res.status(400).json({ error: msg });
  });
}, async (req, res) => {
  console.log("[grade] route handler reached, files:", JSON.stringify(Object.keys(req.files || {})));
  try {
    // upload.any() gives req.files as a flat array — group by fieldname manually
    const allFiles = Array.isArray(req.files) ? req.files : [];
    console.log("[grade] received fields:", allFiles.map(f => f.fieldname + ":" + f.originalname));
    const taskFile        = allFiles.find(f => f.fieldname === "task");
    const rubricFile      = allFiles.find(f => f.fieldname === "rubric");
    const submissionFiles = allFiles.filter(f => f.fieldname === "submissions");
    const namingFile      = allFiles.find(f => f.fieldname === "namingFile");
    const modelAnswerFile = allFiles.find(f => f.fieldname === "modelAnswer"); // optional
    console.log(`[grade] task=${taskFile?.originalname}, rubric=${rubricFile?.originalname}, submissions=${submissionFiles.length}, modelAnswer=${modelAnswerFile?.originalname || "none"}`);

    if (!taskFile) {
      return res.status(400).json({ error: "Assignment task file is required." });
    }
    if (!rubricFile) {
      return res.status(400).json({ error: "Grading rubric file is required." });
    }
    if (submissionFiles.length === 0) {
      return res.status(400).json({ error: "At least one student submission is required." });
    }
    if (!namingFile) {
      return res.status(400).json({ error: "Naming file (Excel/CSV) is required." });
    }

    const markColumn = parseInt(req.body.markColumn, 10);
    if (isNaN(markColumn) || markColumn < 1) {
      return res.status(400).json({ error: "markColumn must be a positive integer (1-based column number)." });
    }
    // Convert to 0-based index
    const markColumnIndex = markColumn - 1;

    // Optional total marks for the assignment — used to tell the AI how to distribute maxScores
    // when the rubric doesn't list explicit marks per criterion.
    const totalMarks = parseInt(req.body.totalMarks, 10) || null;

    // Parse task, rubric, and (optionally) model answer
    const [taskText, rubricText, modelAnswerText] = await Promise.all([
      parseFile(taskFile.path, taskFile.mimetype),
      parseFile(rubricFile.path, rubricFile.mimetype),
      modelAnswerFile ? parseFile(modelAnswerFile.path, modelAnswerFile.mimetype) : Promise.resolve(null),
    ]);

    // Fix 7: clean up task, rubric, and model answer uploads immediately after extraction
    deleteFile(taskFile.path);
    deleteFile(rubricFile.path);
    if (modelAnswerFile) deleteFile(modelAnswerFile.path);

    // Parse all submission texts first (needed for both grading and plagiarism)
    const submissionData = await Promise.all(
      submissionFiles.map(async (file) => {
        const text = await parseFile(file.path, file.mimetype);
        deleteFile(file.path); // Fix 7: clean up submission upload immediately
        return {
          name: path.basename(file.originalname, path.extname(file.originalname)),
          text,
        };
      })
    );

    // Fix 4: skip submissions we couldn't extract text from (scanned / image-only PDFs).
    // Instead of aborting the whole batch, we filter them out and report them at the end.
    const skippedSubmissions = submissionData
      .filter((s) => s.text.trim().length < 50)
      .map((s) => ({
        studentName: s.name,
        reason: "Could not extract readable text (likely a scanned image or image-only PDF).",
      }));
    const readableSubmissions = submissionData.filter((s) => s.text.trim().length >= 50);

    if (skippedSubmissions.length > 0) {
      console.warn(`[grade] skipping ${skippedSubmissions.length} unreadable submission(s):`,
        skippedSubmissions.map(s => s.studentName).join(", "));
    }

    if (readableSubmissions.length === 0) {
      return res.status(400).json({
        error: "None of the uploaded submissions contained readable text. All files appear to be scanned images or image-only PDFs.",
        skipped: skippedSubmissions,
      });
    }

    // Grade ALL submissions including re-uploads — best score per student is kept below
    const total = readableSubmissions.length;
    let done = 0;
    console.log(`[grade] grading all ${total} submissions to find best per student...`);
    const allGrades = await limitedParallel(readableSubmissions, async ({ name, text }) => {
      const result = await gradeWithAI({ taskText, submissionText: text, rubricText, studentName: name, totalMarks, modelAnswerText });
      done++;
      console.log(`[grade] graded ${done}/${total}: ${name}`);
      // Carry the submission text forward so we can run plagiarism on the winning version
      return { ...result, _submissionText: text };
    });

    // Keep only the highest-scoring submission per roll number.
    // Roll key = filename without trailing LMS re-upload suffixes like (1), (2) ...
    const bestMap = new Map();
    for (const grade of allGrades) {
      const rollKey = grade.studentName.replace(/\s*\(\d+\)$/, "").trim().toUpperCase();
      const existing = bestMap.get(rollKey);
      if (!existing || grade.totalScore > existing.totalScore) {
        bestMap.set(rollKey, grade);
      }
    }
    const bestGrades = [...bestMap.values()];
    if (bestGrades.length < allGrades.length) {
      console.log(`[grade] best-version selection: ${allGrades.length} submissions → ${bestGrades.length} unique students`);
    }

    // Run plagiarism only on the best (winning) version of each student
    console.log("[grade] running plagiarism detection on best versions...");
    const plagiarism = detectPlagiarism(
      bestGrades.filter(g => !g.error).map((g) => ({ name: g.studentName, text: g._submissionText }))
    );
    console.log(`[grade] plagiarism done, ${plagiarism.length} pairs flagged`);

    // Strip internal text field before sending to client / report
    const grades = bestGrades.map(({ _submissionText, ...g }) => g);

    // Separate successfully graded from fallback-error results
    const successGrades = grades.filter(g => !g.error);
    const errorGrades   = grades.filter(g => g.error);
    if (errorGrades.length > 0) {
      console.warn(`[grade] ${errorGrades.length} student(s) could not be graded:`,
        errorGrades.map(g => g.studentName).join(", "));
    }
    console.log(`[grade] AI grading done, ${successGrades.length} results (${errorGrades.length} errors)`);

    // Ensure reports directory exists
    const reportsDir = path.join(__dirname, "..", "reports");
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    // Generate the DOCX report and update the naming file with marks
    console.log("[grade] generating reports...");
    await Promise.all([
      generateReport(successGrades),
      updateNamingFile(namingFile.path, successGrades, markColumnIndex),
    ]);

    // Fix 7: clean up naming file upload after it has been read
    deleteFile(namingFile.path);

    console.log("[grade] done — sending response");
    return res.json({ grades: successGrades, errorGrades, skipped: skippedSubmissions, plagiarism });
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
