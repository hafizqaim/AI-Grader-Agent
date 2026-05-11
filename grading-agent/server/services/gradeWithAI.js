const OpenAI = require("openai");

// Ollama runs locally — OpenAI-compatible API, no key required.
const client = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",   // required by SDK but ignored by Ollama
  timeout: 5 * 60 * 1000, // 5-minute per-call timeout
});

// ── Config ───────────────────────────────────────────────────────────────────
const MODEL_NAME    = "llama3.2:3b";
const MAX_TOKENS    = 2000;  // tokens reserved for the JSON response
const MAX_RETRIES   = 3;
const INITIAL_DELAY = 2000; // ms — local model, shorter waits

// Llama 3.2 3B has a 128K context but quality drops on very long inputs.
// Keep inputs focused: ~4 chars per token, budget ~6000 input tokens.
const INPUT_CHAR_BUDGET     = 6000 * 4; // ≈ 24 000 chars
const RUBRIC_CHAR_LIMIT     = Math.floor(INPUT_CHAR_BUDGET * 0.25); // ~6 000
const TASK_CHAR_LIMIT       = Math.floor(INPUT_CHAR_BUDGET * 0.20); // ~4 800
const SUBMISSION_CHAR_LIMIT = Math.floor(INPUT_CHAR_BUDGET * 0.55); // ~13 200

function truncate(text, limit) {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n[...truncated to fit context limit...]";
}

// System prompt kept as a constant so teachers can easily tweak grading behaviour
const GRADING_SYSTEM_PROMPT = `You are an expert academic grader. Your job is to evaluate a student's assignment submission fairly and thoroughly based on the provided rubric.

Always respond in the following strict JSON format with no extra text:
{
  "studentName": "<name>",
  "totalScore": <number>,
  "maxScore": <number>,
  "percentage": <number>,
  "grade": "<A/B/C/D/F>",
  "overallComment": "<2-3 sentence summary>",
  "criteria": [
    {
      "name": "<criterion name>",
      "score": <number awarded>,
      "maxScore": <number>,
      "feedback": "<2-3 sentences explaining the score>"
    }
  ]
}`;

// ── Fix 3: Validate and correct the AI's JSON output ────────────────────────
function validateAndCorrect(data, studentName) {
  // Recompute percentage from actual scores — don't trust AI arithmetic
  if (typeof data.totalScore === "number" && typeof data.maxScore === "number" && data.maxScore > 0) {
    data.percentage = Math.round((data.totalScore / data.maxScore) * 1000) / 10;
  }

  // Derive grade letter from corrected percentage
  const pct = data.percentage || 0;
  if      (pct >= 90) data.grade = "A";
  else if (pct >= 75) data.grade = "B";
  else if (pct >= 60) data.grade = "C";
  else if (pct >= 50) data.grade = "D";
  else                data.grade = "F";

  // Always use the canonical student name (from the filename)
  data.studentName = studentName;

  // Clamp criterion scores so they never exceed their own maxScore
  if (Array.isArray(data.criteria)) {
    data.criteria = data.criteria.map((c) => ({
      ...c,
      score: Math.min(Number(c.score) || 0, Number(c.maxScore) || 0),
    }));
  }

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
          "and the model is pulled (`ollama pull llama3.2:3b`)."
        );
      }

      const isTransient =
        err?.status === 429 ||
        String(err?.message).toLowerCase().includes("rate") ||
        String(err?.message).toLowerCase().includes("quota");

      if (!isTransient || attempt === retries) throw err;

      const wait = delay * Math.pow(2, attempt - 1);
      console.warn(`Attempt ${attempt} failed. Retrying in ${wait / 1000}s…`);
      await new Promise((res) => setTimeout(res, wait));
    }
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

Grade this submission criterion by criterion strictly according to the rubric. Return only valid JSON.`;

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
  } catch (err) {
    throw new Error(
      `AI returned malformed JSON for student "${studentName}".\n\nRaw response:\n${rawText}`
    );
  }

  return validateAndCorrect(parsed, studentName);
}

module.exports = { gradeWithAI };
