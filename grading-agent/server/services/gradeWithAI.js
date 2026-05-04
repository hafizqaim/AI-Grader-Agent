const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

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

/**
 * Grades a student submission using the Claude AI API.
 * @param {Object} params
 * @param {string} params.taskText       - Extracted text from the assignment task document
 * @param {string} params.submissionText - Extracted text from the student's submission
 * @param {string} params.rubricText     - Extracted text from the grading rubric
 * @param {string} params.studentName    - Name of the student being graded
 * @returns {Promise<Object>} Parsed JSON grade result
 */
async function gradeWithAI({ taskText, submissionText, rubricText, studentName }) {
  const userMessage = `## Assignment Task
${taskText}

## Grading Rubric
${rubricText}

## Student Name
${studentName}

## Student Submission
${submissionText}

Grade this submission criterion by criterion strictly according to the rubric. Return only valid JSON.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: GRADING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = response.content[0].text.trim();

  // Strip markdown code fences if the model wraps JSON in them
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  try {
    return JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `AI returned malformed JSON for student "${studentName}".\n\nRaw response:\n${rawText}`
    );
  }
}

module.exports = { gradeWithAI };
