const OpenAI = require("openai");

// Ollama endpoint — set OLLAMA_BASE_URL in .env to use a remote instance (e.g. Colab+ngrok).
// Falls back to local Ollama if not set.
const client = new OpenAI({
  baseURL: (process.env.OLLAMA_BASE_URL || "http://localhost:11434") + "/v1",
  apiKey: "ollama",
  timeout: 10 * 60 * 1000,
});

// ── Config ───────────────────────────────────────────────────────────────────
// qwen2.5:14b — best fit for Colab T4 (15 GB VRAM, ~9 GB used).
// Much stronger at structured JSON output and instruction-following than mistral:7b.
// Falls back gracefully to mistral:7b if MODEL_NAME is overridden via env var.
const MODEL_NAME    = process.env.OLLAMA_MODEL || "qwen2.5:14b";
const MAX_TOKENS    = 3000;  // larger model can produce richer responses
const MAX_RETRIES   = 3;
const INITIAL_DELAY = 2000;

// qwen2.5:14b supports 32K context; keep inputs focused for quality.
// ~4 chars per token, budget ~8000 input tokens.
const INPUT_CHAR_BUDGET     = 8000 * 4; // ≈ 32 000 chars
const RUBRIC_CHAR_LIMIT     = Math.floor(INPUT_CHAR_BUDGET * 0.25); // ~8 000
const TASK_CHAR_LIMIT       = Math.floor(INPUT_CHAR_BUDGET * 0.20); // ~6 400
const SUBMISSION_CHAR_LIMIT = Math.floor(INPUT_CHAR_BUDGET * 0.55); // ~17 600

function truncate(text, limit) {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n[...truncated to fit context limit...]";
}

// System prompt — explicit about using ONLY the rubric's criteria, no invention
const GRADING_SYSTEM_PROMPT = `You are a strict academic grader. Evaluate the student submission using ONLY the criteria listed in the rubric.

CRITICAL RULES:
1. The "criteria" array MUST contain EXACTLY ONE entry per question/criterion in the rubric — no more, no less.
2. Do NOT invent, merge, or skip any criterion. Use the exact criterion names from the rubric.
3. Every criterion entry MUST include "maxScore" — read it directly from the rubric. NEVER omit or set it to 0 unless the rubric says 0.
4. "score" must be between 0 and "maxScore" for that criterion.
5. "totalScore" MUST equal the exact arithmetic sum of all criterion "score" values.
6. "maxScore" at the top level MUST equal the exact arithmetic sum of all criterion "maxScore" values.
7. Return ONLY a single flat JSON object — no nested objects, no markdown fences, no explanation.

Required JSON format (copy this structure exactly):
{
  "studentName": "<name>",
  "totalScore": <number>,
  "maxScore": <number>,
  "percentage": <number>,
  "grade": "<A/B/C/D/F>",
  "overallComment": "<2-3 sentence summary>",
  "criteria": [
    { "name": "<criterion 1 name>", "score": <number>, "maxScore": <number from rubric>, "feedback": "<feedback>" },
    { "name": "<criterion 2 name>", "score": <number>, "maxScore": <number from rubric>, "feedback": "<feedback>" }
  ]
}`;

// ── Deep-scan an object to extract criterion-like entries ───────────────────
// Handles models that nest criteria inside a sub-object instead of a flat array.
function extractCriteria(obj) {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) {
    // Already an array — flatten any nested arrays and return flat criterion objects
    return obj.flatMap((item) =>
      item && typeof item === "object" && ("score" in item || "Score" in item)
        ? [item]
        : extractCriteria(item)
    );
  }
  // It's a plain object — check if every value looks like a criterion
  const entries = Object.entries(obj);
  const results = [];
  for (const [key, val] of entries) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const hasScore = "score" in val || "Score" in val;
      if (hasScore) {
        // This key is a criterion name; val holds its properties
        results.push({
          name:     val.name || key,
          score:    Number(val.score ?? val.Score) || 0,
          maxScore: Number(val.maxScore ?? val.MaxScore ?? val.max_score ?? val.marks ?? val.Marks) || 0,
          feedback: val.feedback || val.Feedback || val.Response || val.response || val.comment || "",
        });
      } else {
        // Recurse one level deeper (e.g. model wrapped criteria in "Assignment(2)": {...})
        const nested = extractCriteria(val);
        if (nested.length > 0) results.push(...nested);
      }
    }
  }
  return results;
}

// ── Validate and correct the AI's JSON output ───────────────────────────────
function validateAndCorrect(data, studentName) {
  // Always use the canonical student name (from the filename)
  data.studentName = studentName;

  // Normalise criteria — handle array, plain object, or deeply nested structures
  if (!Array.isArray(data.criteria)) {
    if (data.criteria && typeof data.criteria === "object") {
      // Try Object.values first (simple object map)
      const vals = Object.values(data.criteria);
      if (vals.length > 0 && vals.every((v) => v && typeof v === "object" && ("score" in v || "Score" in v))) {
        data.criteria = vals;
      } else {
        data.criteria = extractCriteria(data.criteria);
      }
    } else {
      // criteria missing entirely — try to extract from the whole response object
      data.criteria = extractCriteria(data);
    }
  }
  if (!Array.isArray(data.criteria)) data.criteria = [];

  // Coerce types; only clamp score ≤ maxScore when maxScore is actually known (> 0)
  data.criteria = data.criteria.map((c) => {
    const score    = Number(c.score ?? c.Score) || 0;
    const maxScore = Number(c.maxScore ?? c.MaxScore ?? c.max_score) || 0;
    return {
      ...c,
      name:     c.name || "",
      score:    maxScore > 0 ? Math.min(score, maxScore) : score,
      maxScore,
      feedback: c.feedback || c.Feedback || c.Response || c.response || "",
    };
  });

  // Recompute totalScore and maxScore from criteria — never trust the model's arithmetic
  if (data.criteria.length > 0) {
    data.totalScore = data.criteria.reduce((sum, c) => sum + c.score,    0);
    data.maxScore   = data.criteria.reduce((sum, c) => sum + c.maxScore, 0);
  } else {
    data.totalScore = Number(data.totalScore) || 0;
    data.maxScore   = Number(data.maxScore)   || 0;
  }

  // Recompute percentage
  data.percentage = data.maxScore > 0
    ? Math.round((data.totalScore / data.maxScore) * 1000) / 10
    : 0;

  // Derive grade letter from corrected percentage
  const pct = data.percentage;
  if      (pct >= 90) data.grade = "A";
  else if (pct >= 75) data.grade = "B";
  else if (pct >= 60) data.grade = "C";
  else if (pct >= 50) data.grade = "D";
  else                data.grade = "F";

  // Warn if all criteria have maxScore=0 (model omitted them)
  if (data.criteria.length > 0 && data.maxScore === 0) {
    console.warn(`[validateAndCorrect] WARNING: "${data.studentName}" — all criteria have maxScore=0. The model likely omitted maxScores. Scores may be unreliable.`);
  }

  // Note: we do NOT enforce a strict criterion count because a student may
  // legitimately split one question into sub-parts (e.g. Q1a + Q1b).
  // The important invariant is that totalScore/maxScore is computed from the
  // actual criteria list, which is enforced above.

  return data;
}

// ── Fix 2: Exponential-backoff retry around any async fn ────────────────────
async function withRetry(fn, retries = MAX_RETRIES, delay = INITIAL_DELAY) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err?.code === "ECONNREFUSED") {
        throw new Error(
          "Cannot connect to Ollama. Make sure Ollama is running (`ollama serve`) " +
          "and the model is pulled (`ollama pull mistral:7b`)."
        );
      }

      const isTransient =
        err?.status === 429 ||
        err?.status === 500 || // Ollama runner crash — wait and retry
        String(err?.message).toLowerCase().includes("rate") ||
        String(err?.message).toLowerCase().includes("quota") ||
        String(err?.message).toLowerCase().includes("terminated");

      if (!isTransient || attempt === retries) throw err;

      const wait = delay * Math.pow(2, attempt - 1);
      console.warn(`Attempt ${attempt} failed. Retrying in ${wait / 1000}s…`);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
}

/**
 * Asks the model to repair a malformed JSON response into the required format.
 * Returns a parsed object on success, or null on failure.
 */
async function repairJSON(brokenText, studentName) {
  const repairPrompt = `The text below was supposed to be a JSON grading result but has syntax errors or the wrong structure.
Rewrite it as valid JSON matching EXACTLY this format — no extra keys, no markdown:
{
  "studentName": "${studentName}",
  "totalScore": <number>,
  "maxScore": <number>,
  "percentage": <number>,
  "grade": "<A/B/C/D/F>",
  "overallComment": "<2-3 sentence summary>",
  "criteria": [
    { "name": "<criterion name>", "score": <number>, "maxScore": <number>, "feedback": "<feedback>" }
  ]
}

Broken text:
${brokenText}

Return ONLY the corrected JSON, nothing else.`;

  try {
    const response = await client.chat.completions.create({
      model: MODEL_NAME,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You fix broken JSON. Return only valid JSON, nothing else." },
        { role: "user",   content: repairPrompt },
      ],
    });
    const text = response.choices[0].message.content.trim()
      .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

/**
 * Grades a student submission using the Gemini AI API.
 * @param {Object} params
 * @param {string} params.taskText       - Extracted text from the assignment task document
 * @param {string} params.submissionText - Extracted text from the student's submission
 * @param {string} params.rubricText     - Extracted text from the grading rubric
 * @param {string} params.studentName    - Name of the student being graded
 * @returns {Promise<Object>} Parsed, validated JSON grade result
 */
async function gradeWithAI({ taskText, submissionText, rubricText, studentName }) {
  // Truncate each section to stay within GitHub Models' 8 000-token request limit
  const safeTask       = truncate(taskText,       TASK_CHAR_LIMIT);
  const safeRubric     = truncate(rubricText,     RUBRIC_CHAR_LIMIT);
  const safeSubmission = truncate(submissionText, SUBMISSION_CHAR_LIMIT);

  const userMessage = `## Assignment Task
${safeTask}

## Grading Rubric
${safeRubric}

## Student Name
${studentName}

## Student Submission
${safeSubmission}

STEP 1 — Before writing any JSON, silently count the number of distinct criteria/questions in the rubric above. Write down that count.
STEP 2 — Your "criteria" array MUST have EXACTLY that many entries — one per rubric criterion, no more, no less.
STEP 3 — For each criterion, read its maxScore directly from the rubric. NEVER leave maxScore as 0 unless the rubric explicitly gives it 0 marks.
STEP 4 — Return ONLY the final JSON object. No markdown, no explanation, no extra keys.`;

  const rawText = await withRetry(async () => {
    const response = await client.chat.completions.create({
      model: MODEL_NAME,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" }, // force JSON mode in Ollama
      messages: [
        { role: "system", content: GRADING_SYSTEM_PROMPT },
        { role: "user",   content: userMessage },
      ],
    });
    return response.choices[0].message.content.trim();
  });

  // Strip markdown code fences if the model wraps JSON in them
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (_parseErr) {
    // The model returned broken JSON — ask it to repair itself (one extra attempt)
    console.warn(`[gradeWithAI] malformed JSON for "${studentName}", attempting repair…`);
    const repaired = await repairJSON(rawText, studentName);
    if (repaired) {
      parsed = repaired;
    } else {
      // Repair also failed — return a fallback so the rest of the batch continues
      console.error(`[gradeWithAI] repair failed for "${studentName}", returning fallback grade`);
      return {
        studentName,
        totalScore: 0,
        maxScore: 0,
        percentage: 0,
        grade: "F",
        overallComment: "Grading could not be completed — the AI returned an unreadable response. Please re-grade this student manually.",
        criteria: [],
        error: true,
      };
    }
  }

  return validateAndCorrect(parsed, studentName);
}

module.exports = { gradeWithAI };
