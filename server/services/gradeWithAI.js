const OpenAI = require("openai");
const { buildWebSearchContext, isResearchAssignment } = require("./webSearch");

// ── AI Backend Selection ──────────────────────────────────────────────────────
// Priority:
//   1. MISTRAL_API_KEY set → use Mistral API (cloud, no GPU needed)
//   2. Otherwise           → use Ollama (local or Colab+ngrok)
//
// To use Mistral: add MISTRAL_API_KEY=your_key to server/.env
// To use Colab:   set OLLAMA_BASE_URL=<ngrok_url> and OLLAMA_CONCURRENCY=3
// To use local:   leave both unset (defaults to http://localhost:11434)

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const USING_MISTRAL   = !!MISTRAL_API_KEY;

let client, MODEL_NAME;

if (USING_MISTRAL) {
  // Mistral API — uses OpenAI-compatible SDK pointed at Mistral's endpoint
  client = new OpenAI({
    baseURL: "https://api.mistral.ai/v1",
    apiKey:  MISTRAL_API_KEY,
    timeout: 5 * 60 * 1000, // Mistral is fast — 5 min is plenty
  });
  // Default to mistral-medium-latest; override with MISTRAL_MODEL env var
  MODEL_NAME = process.env.MISTRAL_MODEL || "mistral-medium-latest";
  console.log(`[gradeWithAI] Backend: Mistral API (model: ${MODEL_NAME})`);
} else {
  // Ollama — local or remote Colab+ngrok
  client = new OpenAI({
    baseURL: (process.env.OLLAMA_BASE_URL || "http://localhost:11434") + "/v1",
    apiKey:  "ollama",
    timeout: 10 * 60 * 1000,
  });
  MODEL_NAME = process.env.OLLAMA_MODEL || "qwen2.5:14b";
  console.log(`[gradeWithAI] Backend: Ollama (model: ${MODEL_NAME}, url: ${process.env.OLLAMA_BASE_URL || "http://localhost:11434"})`);
}

// ── Config ───────────────────────────────────────────────────────────────────
const MAX_TOKENS    = 10000; // qwen3:14b needs room for <think> block (~2-4K) + JSON response
const MAX_RETRIES   = 3;
const INITIAL_DELAY = 2000;

// ── Mistral free-tier throttle ────────────────────────────────────────────────
// Free-tier Mistral allows ~1-2 requests/minute depending on the model.
// A proactive gap between calls avoids hitting 429 in the first place.
// When a 429 still occurs the retry handler waits a full 65 s (just over 1 minute).
const MISTRAL_MIN_CALL_INTERVAL_MS = 12000; // 12 s gap ≈ 5 req/min — safe for free tier
let   _lastMistralCallAt = 0;

async function callAI(params) {
  if (USING_MISTRAL) {
    const elapsed = Date.now() - _lastMistralCallAt;
    const gap     = MISTRAL_MIN_CALL_INTERVAL_MS - elapsed;
    if (gap > 0) {
      console.log(`[gradeWithAI] Mistral throttle: waiting ${(gap / 1000).toFixed(1)}s before next request…`);
      await new Promise(r => setTimeout(r, gap));
    }
    _lastMistralCallAt = Date.now();
  }
  return client.chat.completions.create(params);
}

// qwen2.5:14b supports 32K context tokens — ~4 chars/token → 128K char budget.
// Distribute generously so long rubrics (with narrative model answers) are never truncated.
const INPUT_CHAR_BUDGET       = 32000 * 4;                            // ≈ 128 000 chars
const RUBRIC_CHAR_LIMIT       = Math.floor(INPUT_CHAR_BUDGET * 0.30); // ~38 400 chars
const TASK_CHAR_LIMIT         = Math.floor(INPUT_CHAR_BUDGET * 0.15); // ~19 200 chars
const MODEL_ANSWER_CHAR_LIMIT = Math.floor(INPUT_CHAR_BUDGET * 0.20); // ~25 600 chars
const SUBMISSION_CHAR_LIMIT   = Math.floor(INPUT_CHAR_BUDGET * 0.35); // ~44 800 chars

function truncate(text, limit) {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n[...truncated to fit context limit...]";
}

// ── Rubric table cleaner ──────────────────────────────────────────────────────
// Mammoth extracts DOCX tables as plain text rows (one cell per line), producing:
//   Criteria\nMarks\nExcellent...\n<criterion name>\n10\n<descriptions...>
// This function locates every "Rubric – Question N" section, extracts the
// criterion+marks pairs, deduplicates them, and prepends a clean summary.
function cleanRubricText(text) {
  const rubricHeadingRe = /Rubric\s*[–\-—]\s*Question\s*\d+/gi;
  // Table header noise rows — column headers or summary table labels, not criteria
  const headerNoise = /^(criteria|marks|excellent|good|adequate|poor|satisfactory|unsatisfactory|outstanding|needs improvement|max marks|maximum marks|total marks|overall marks|key evaluation focus|evaluation focus|overall assessment|question)\b/i;
  // Patterns that indicate we've left the per-question rubric section and hit a summary table
  const summaryTableRe = /^(overall\s+grading|grade\s+summary|summary\s+table|total\s+marks|assessment\s+summary|final\s+marks)/i;

  const sectionStarts = [];
  let m;
  while ((m = rubricHeadingRe.exec(text)) !== null) {
    sectionStarts.push(m.index);
  }

  if (sectionStarts.length === 0) return text; // no rubric tables found

  // Also collect narrative "Question N:" headings to use as section end markers
  const narrativeHeadingRe = /^Question\s+\d+\s*:/gim;
  const narrativeStarts = [];
  while ((m = narrativeHeadingRe.exec(text)) !== null) {
    narrativeStarts.push(m.index);
  }

  const rawCriteria = [];

  for (let s = 0; s < sectionStarts.length; s++) {
    const start = sectionStarts[s];
    // End at the next rubric section OR the next narrative question heading, whichever comes first
    const nextRubric    = sectionStarts[s + 1] ?? text.length;
    const nextNarrative = narrativeStarts.find(n => n > start) ?? text.length;
    const end = Math.min(nextRubric, nextNarrative);

    const section = text.slice(start, end);
    const lines = section.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (headerNoise.test(line) && line.length < 100) continue;
      if (summaryTableRe.test(line)) break; // stop at summary table
      if (/^\d+$/.test(line)) continue;

      // Look ahead up to 3 lines for a standalone integer (the marks value)
      for (let j = 1; j <= 3 && i + j < lines.length; j++) {
        const ahead = lines[i + j];
        if (/^\d+$/.test(ahead) && Number(ahead) > 0 && Number(ahead) <= 100) {
          rawCriteria.push({ name: line, marks: Number(ahead) });
          i += j;
          break;
        }
      }
    }
  }

  if (rawCriteria.length === 0) return text;

  // Determine the most common (mode) marks value — summary rows typically differ from it
  const marksCounts = {};
  rawCriteria.forEach(c => { marksCounts[c.marks] = (marksCounts[c.marks] || 0) + 1; });
  const modeMarks = parseInt(Object.entries(marksCounts).sort((a, b) => b[1] - a[1])[0][0]);

  // Filter out: rows whose marks are > 1.5× the mode (likely summary/aggregate rows)
  const filtered = rawCriteria.filter(c => c.marks <= modeMarks * 1.5);

  // Deduplicate: skip any criterion whose key words largely overlap with an earlier one.
  // Exception: criteria that differ by a sub-part marker like (a)/(b) are NOT duplicates
  // even when they share all other keywords (e.g. "Advantages ... (a)" vs "Advantages ... (b)").
  function keywords(s) {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 4);
  }
  // Returns the trailing sub-part letter/number if present, e.g. "(a)" → "a", "(2)" → "2"
  function subPart(s) {
    const m = s.match(/\(\s*([a-zA-Z0-9])\s*\)\s*$/);
    return m ? m[1].toLowerCase() : null;
  }
  const deduped = [];
  for (const c of filtered) {
    const kw = keywords(c.name);
    const spC = subPart(c.name);
    const isDupe = deduped.some(existing => {
      const overlap = kw.filter(w => keywords(existing.name).includes(w)).length;
      if (overlap < 2) return false;
      // Different sub-part markers (a) vs (b) → treat as distinct criteria, not duplicates
      const spE = subPart(existing.name);
      if (spC !== null && spE !== null && spC !== spE) return false;
      return true;
    });
    if (!isDupe) deduped.push(c);
  }

  const criteriaLines = deduped.map(c => `- ${c.name} (${c.marks} marks)`);
  const totalMarks = deduped.reduce((s, c) => s + c.marks, 0);

  const summary =
    `GRADING CRITERIA (extracted from rubric — total: ${totalMarks} marks):\n` +
    criteriaLines.join("\n") + "\n\n---\n\n";

  console.log("[cleanRubricText] extracted criteria:\n" + criteriaLines.join("\n") +
    `\nTotal: ${totalMarks} marks`);
  return summary + text;
}

// System prompt — explicit about using ONLY the rubric's criteria, no invention.
// Also instructs the model to use rubric band descriptors (Excellent/Good/Adequate/Poor)
// to derive principled scores rather than guessing arbitrary numbers.
const GRADING_SYSTEM_PROMPT = `You are a strict academic grader. Evaluate the student submission using ONLY the criteria listed in the rubric.

CRITICAL RULES:
1. The "criteria" array MUST contain EXACTLY ONE entry per question/criterion in the rubric — no more, no less.
2. Do NOT invent, merge, or skip any criterion. Use the exact criterion names from the rubric.
3. MARKS/maxScore rule:
   a. If the rubric explicitly states marks for a criterion (e.g. "Q1 [10 marks]"), use that number as maxScore.
   b. If the rubric does NOT state any marks at all, assume a total of 100 marks distributed EQUALLY across all criteria. For example, 4 criteria → each maxScore = 25.
   c. NEVER set maxScore to 0 unless the rubric explicitly says 0 marks for that criterion.
4. BAND-BASED SCORING — if the rubric defines quality bands (e.g. Excellent / Good / Adequate / Poor, or Outstanding / Satisfactory / Needs Improvement, or similar), you MUST:
   a. Read the band descriptors carefully for each criterion.
   b. Determine which band the student's answer falls into based on the descriptors.
   c. Derive the numeric score from the band's percentage range applied to the criterion's maxScore:
      - Excellent / Outstanding (90–100%): score = round(maxScore × 0.95)
      - Good / Proficient      (70–89%):  score = round(maxScore × 0.80)
      - Adequate / Satisfactory (50–69%): score = round(maxScore × 0.60)
      - Poor / Insufficient    (<50%):    score = round(maxScore × 0.30)
   d. In the feedback field, explicitly state which band was awarded and WHY (e.g. "Band: Good — the student correctly identified most management functions but lacked depth in the 'controlling' analysis.").
5. "score" must be between 0 and "maxScore" for that criterion.
6. "totalScore" MUST equal the exact arithmetic sum of all criterion "score" values.
7. "maxScore" at the top level MUST equal the exact arithmetic sum of all criterion "maxScore" values.
8. Return ONLY a single flat JSON object — no nested objects, no markdown fences, no explanation.

Required JSON format (copy this structure exactly):
{
  "studentName": "<name>",
  "totalScore": <number>,
  "maxScore": <number>,
  "percentage": <number>,
  "grade": "<A/B/C/D/F>",
  "overallComment": "<2-3 sentence summary>",
  "criteria": [
    { "name": "<criterion 1 name>", "score": <number>, "maxScore": <number>, "feedback": "<band + reason>" },
    { "name": "<criterion 2 name>", "score": <number>, "maxScore": <number>, "feedback": "<band + reason>" }
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
function validateAndCorrect(data, studentName, expectedMaxScore = null) {
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

  // Safety net: if all criteria still have maxScore=0 (rubric had no marks),
  // infer equal distribution over 100 so scores are never silently zeroed out.
  if (data.criteria.length > 0 && data.maxScore === 0) {
    console.warn(`[validateAndCorrect] "${data.studentName}" — all maxScores are 0 (rubric had no marks). Inferring equal distribution over 100.`);
    const equalMax = Math.round(100 / data.criteria.length);
    data.criteria = data.criteria.map((c) => ({
      ...c,
      maxScore: equalMax,
      // Re-clamp score now that we have a real maxScore
      score: Math.min(c.score > 0 ? c.score : Math.round(equalMax * 0.7), equalMax),
    }));
    // Recompute totals with the inferred values
    data.totalScore = data.criteria.reduce((sum, c) => sum + c.score, 0);
    data.maxScore   = data.criteria.reduce((sum, c) => sum + c.maxScore, 0);
    data.percentage = Math.round((data.totalScore / data.maxScore) * 1000) / 10;
    const pct2 = data.percentage;
    data.grade = pct2 >= 90 ? "A" : pct2 >= 75 ? "B" : pct2 >= 60 ? "C" : pct2 >= 50 ? "D" : "F";
  }

  // Normalize to a single assignment-wide max score when we can infer it.
  // Policy:
  // - If AI max is LOWER than expected, keep awarded marks as-is and add missing
  //   marks as zero (represents unaddressed rubric portion).
  // - If AI max is HIGHER than expected, proportionally scale down to expected.
  // This prevents mixed outputs like some students graded out of 70 and others out of 80.
  if (expectedMaxScore && expectedMaxScore > 0 && data.maxScore > 0) {
    const eps = 0.0001;
    if (Math.abs(data.maxScore - expectedMaxScore) > eps) {
      const actualBefore = data.maxScore;

      // Case A: AI returned too few total marks (e.g. 70 instead of 80)
      // Add a zero-scored remainder criterion instead of scaling awarded marks up.
      if (data.maxScore < expectedMaxScore) {
        const missing = Math.round((expectedMaxScore - data.maxScore) * 100) / 100;
        if (Array.isArray(data.criteria)) {
          data.criteria.push({
            name: "Unaddressed rubric criterion(s)",
            score: 0,
            maxScore: missing,
            feedback: "One or more rubric criteria were not evidenced in the submission.",
          });
          data.totalScore = data.criteria.reduce((sum, c) => sum + c.score, 0);
          data.maxScore   = data.criteria.reduce((sum, c) => sum + c.maxScore, 0);
        } else {
          data.maxScore = expectedMaxScore;
        }
      } else {
        // Case B: AI returned too many total marks (e.g. 90 instead of 80)
        // Scale down proportionally so percentages remain consistent.
        const factor = expectedMaxScore / data.maxScore;
        if (Array.isArray(data.criteria) && data.criteria.length > 0) {
          data.criteria = data.criteria.map((c) => {
            const scaledMax = Math.max(0, Math.round(c.maxScore * factor * 100) / 100);
            const scaledScore = Math.max(0, Math.round(c.score * factor * 100) / 100);
            return {
              ...c,
              maxScore: scaledMax,
              score: Math.min(scaledScore, scaledMax),
            };
          });
          data.totalScore = data.criteria.reduce((sum, c) => sum + c.score, 0);
          data.maxScore   = data.criteria.reduce((sum, c) => sum + c.maxScore, 0);

          // Correct small rounding drift to hit the expected total exactly.
          const drift = Math.round((expectedMaxScore - data.maxScore) * 100) / 100;
          if (Math.abs(drift) > eps && data.criteria.length > 0) {
            const last = data.criteria[data.criteria.length - 1];
            const newLastMax = Math.max(0, Math.round((last.maxScore + drift) * 100) / 100);
            data.criteria[data.criteria.length - 1] = {
              ...last,
              maxScore: newLastMax,
              score: Math.min(last.score, newLastMax),
            };
            data.totalScore = data.criteria.reduce((sum, c) => sum + c.score, 0);
            data.maxScore   = data.criteria.reduce((sum, c) => sum + c.maxScore, 0);
          }
        } else {
          data.totalScore = Math.round((data.totalScore * factor) * 100) / 100;
          data.maxScore   = expectedMaxScore;
        }
      }

      data.percentage = data.maxScore > 0
        ? Math.round((data.totalScore / data.maxScore) * 1000) / 10
        : 0;

      const pct3 = data.percentage;
      data.grade = pct3 >= 90 ? "A" : pct3 >= 75 ? "B" : pct3 >= 60 ? "C" : pct3 >= 50 ? "D" : "F";

      console.warn(
        `[validateAndCorrect] "${data.studentName}" maxScore normalized ${actualBefore} -> ${expectedMaxScore}`
      );
    }
  }

  return data;
}

function deriveExpectedMaxScore(cleanedRubric, totalMarks, rawRubricText = "") {
  const explicitTotal = Number(totalMarks);
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return explicitTotal;
  }

  // Prefer explicit totals found in the original rubric text (more reliable than
  // extracted criteria if one criterion was missed by extraction).
  const candidates = [];
  const rawPatterns = [
    /(?:total\s+marks?|maximum\s+marks?|max\s+marks?)\s*[:\-]?\s*(\d{2,4})/gi,
    /out\s+of\s*(\d{2,4})\s*marks?/gi,
  ];
  for (const re of rawPatterns) {
    let mm;
    while ((mm = re.exec(rawRubricText)) !== null) {
      const n = Number(mm[1]);
      if (Number.isFinite(n) && n > 0 && n <= 1000) candidates.push(n);
    }
  }
  if (candidates.length > 0) {
    return Math.max(...candidates);
  }

  const m = cleanedRubric.match(/GRADING CRITERIA \(extracted from rubric [^)]* total:\s*(\d+)\s*marks\):/i);
  if (m) {
    const parsed = Number(m[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

// ── Fix 2: Exponential-backoff retry around any async fn ────────────────────
async function withRetry(fn, retries = MAX_RETRIES, delay = INITIAL_DELAY) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // ── Connection refused ──────────────────────────────────────────────────
      if (err?.code === "ECONNREFUSED") {
        if (USING_MISTRAL) {
          throw new Error("Cannot connect to Mistral API. Check your internet connection.");
        }
        throw new Error(
          "Cannot connect to Ollama. Make sure Ollama is running (`ollama serve`) " +
          "and the model is pulled (`ollama pull qwen2.5:14b`)."
        );
      }

      // ── Mistral-specific errors (auth + rate limits) ────────────────────────
      if (USING_MISTRAL) {
        // Invalid API key — do not retry, fail immediately with clear message
        if (err?.status === 401 || err?.status === 403) {
          throw new Error(
            "MISTRAL_AUTH_ERROR: Invalid or missing Mistral API key. " +
            "Check MISTRAL_API_KEY in server/.env."
          );
        }

        if (err?.status === 429) {
          // Determine if this is a hard monthly quota or a soft per-minute rate limit.
          // Mistral returns a 'retry-after' header: large value (hours/days) = monthly cap.
          const retryAfterRaw =
            err?.headers?.["retry-after"] ||
            err?.response?.headers?.["retry-after"];
          const retryAfterSec = retryAfterRaw ? parseInt(retryAfterRaw, 10) : 0;
          const errMsg = String(err?.message || "").toLowerCase();
          const isMonthlyLimit =
            errMsg.includes("month") ||
            errMsg.includes("quota") ||
            retryAfterSec > 3600; // >1 hour wait = not a minute-level rate limit

          if (isMonthlyLimit) {
            throw new Error(
              "MISTRAL_QUOTA_EXCEEDED: Monthly free-tier token limit exhausted. " +
              "Add a payment method at https://console.mistral.ai or switch to Ollama (Colab)."
            );
          }

          if (attempt === retries) {
            throw new Error(
              `MISTRAL_RATE_LIMIT: Mistral API rate limit hit after ${retries} retries. ` +
              "Try grading fewer submissions at once, or wait a minute and try again."
            );
          }

          // Respect the retry-after header; fall back to 65 s minimum.
          // Mistral free tier resets on a per-minute window — 5 s was never enough.
          const waitMs = retryAfterSec > 0
            ? retryAfterSec * 1000
            : Math.max(65000, delay * Math.pow(2, attempt - 1));
          console.warn(`[gradeWithAI] Mistral rate limit (attempt ${attempt}/${retries}). Waiting ${(waitMs / 1000).toFixed(0)}s…`);
          await new Promise((res) => setTimeout(res, waitMs));
          continue;
        }
      }

      // ── Generic transient errors (Ollama crash, server errors, etc.) ────────
      const isTransient =
        err?.status === 429 ||
        err?.status === 500 ||
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
    const response = await callAI({
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
async function gradeWithAI({ taskText, submissionText, rubricText, studentName, totalMarks = null, modelAnswerText = null }) {
  // Clean up the rubric table format before truncating
  const cleanedRubric = cleanRubricText(rubricText);
  const expectedMaxScore = deriveExpectedMaxScore(cleanedRubric, totalMarks, rubricText);

  // Truncate each section to fit within the 32K-token context window of Qwen2.5:14b
  const safeTask        = truncate(taskText,        TASK_CHAR_LIMIT);
  const safeRubric      = truncate(cleanedRubric,   RUBRIC_CHAR_LIMIT);
  const safeSubmission  = truncate(submissionText,  SUBMISSION_CHAR_LIMIT);
  const safeModelAnswer = modelAnswerText
    ? truncate(modelAnswerText, MODEL_ANSWER_CHAR_LIMIT)
    : null;

  // Tell the model the total marks if the user specified them, so it can distribute
  // maxScores correctly even when the rubric doesn't list marks per criterion.
  const marksHint = totalMarks
    ? `The assignment is marked out of ${totalMarks} total marks. Distribute these equally across all criteria if the rubric does not specify marks per criterion.`
    : `If the rubric does not specify marks per criterion, assume a total of 100 marks distributed equally.`;

  // Build the model-answer section only when one was provided
  const modelAnswerSection = safeModelAnswer
    ? `\n## Model Answer / Ideal Solution (use as reference for quality comparison — do NOT simply check if the student copied it)\n${safeModelAnswer}\n`
    : "";

  // Web search — auto-enabled for research assignments when TAVILY_API_KEY is set
  let webSearchSection = "";
  if (process.env.TAVILY_API_KEY && isResearchAssignment(taskText + " " + rubricText)) {
    console.log(`[gradeWithAI] Research assignment detected — running web search for "${studentName}"…`);
    const ctx = await buildWebSearchContext(submissionText, taskText);
    if (ctx) {
      webSearchSection = "\n" + ctx + "\n";
      console.log(`[gradeWithAI] Web search context injected for "${studentName}"`);
    }
  }

  const userMessage = `## Assignment Task
${safeTask}

## Grading Rubric
${safeRubric}
${modelAnswerSection}${webSearchSection}
## Marks
${marksHint}

## Student Name
${studentName}

## Student Submission
${safeSubmission}

STEP 1 — Read the rubric carefully and count EVERY distinct criterion/question (including sub-criteria like Q1a, Q1b).
STEP 2 — Your "criteria" array MUST have EXACTLY that many entries — one per rubric criterion.
STEP 3 — For each criterion, identify which quality band (Excellent/Good/Adequate/Poor or equivalent) the student's answer falls into, then convert to a numeric score using the band percentage ranges.
STEP 4 — Set each criterion's maxScore from the rubric. NEVER leave maxScore as 0.
STEP 5 — Return ONLY the final JSON object. No markdown, no explanation, no extra keys.`;

  const rawText = await withRetry(async () => {
    const response = await callAI({
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

  // Strip qwen3 thinking blocks (<think>...</think>) then markdown code fences
  const jsonText = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, "")  // remove thinking traces
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

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

  return validateAndCorrect(parsed, studentName, expectedMaxScore);
}

module.exports = { gradeWithAI };
