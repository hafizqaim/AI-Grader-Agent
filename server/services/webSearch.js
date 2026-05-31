// ── Web Search Service ─────────────────────────────────────────────────────
// Uses Tavily Search API (https://tavily.com) to perform real-time web lookups.
// Designed for research-based assignments where students cite real-world cases
// and references that need to be verified before grading.
//
// Free tier: 1 000 API credits/month — sufficient for academic grading batches.
// Get a key at: https://app.tavily.com
// Set TAVILY_API_KEY in server/.env to enable.

const TAVILY_KEY = process.env.TAVILY_API_KEY;

// ── Core search call ──────────────────────────────────────────────────────────
async function tavilySearch(query, maxResults = 3) {
  if (!TAVILY_KEY) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query,
        search_depth: "basic",
        max_results: maxResults,
        include_answer: true,      // Tavily generates an AI summary — very useful for injection
        include_raw_content: false,
        include_images: false,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[webSearch] Tavily HTTP ${res.status} for: "${query}"`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[webSearch] Search failed for "${query}":`, err.message);
    return null;
  }
}

// ── Reference-section extractor ───────────────────────────────────────────────
// Finds a "References" / "Bibliography" / "Sources" heading and returns each
// non-empty line beneath it as a searchable reference string.
function extractReferenceLines(text) {
  const m = /(?:^|\n)\s*(?:references?|bibliography|sources?|works?\s+cited)\s*[:\-]?\s*\n/i.exec(text);
  if (!m) return [];
  const after = text.slice(m.index + m[0].length);
  return after
    .split(/\n/)
    .map(l => l.replace(/^\s*\d+[\.\)]\s*/, "").trim()) // strip "1. " / "1)"
    .filter(l => l.length > 15 && l.length < 350)
    .slice(0, 6);
}

// ── Research-assignment detector ──────────────────────────────────────────────
// Returns true when the task/rubric text signals an internet-research assignment.
function isResearchAssignment(text) {
  return /\b(references?|bibliography|cite|citations?|find\s+examples|similar\s+incidents?|local\s+organizations?|national\s+organizations?|real[\s-]world\s+examples?|case\s+stud(?:y|ies)|internet|web\s+search|online\s+research)\b/i.test(text);
}

// ── Build web-search context for injection into grading prompt ─────────────────
// Runs up to 5 parallel Tavily searches and returns a formatted Markdown block
// ready to be inserted before the student submission in the grading prompt.
async function buildWebSearchContext(submissionText, taskText = "") {
  if (!TAVILY_KEY) return null;

  const queries = [];

  // Priority 1 — Reference lines are the most directly verifiable
  const refs = extractReferenceLines(submissionText);
  refs.slice(0, 3).forEach(r => queries.push(r));

  // Priority 2 — Named organizations extracted from the submission body
  // Matches common Pakistani / general org name patterns
  const orgRe = /\b([A-Z][A-Za-z&\s]{2,35}(?:Pakistan|Ltd\.?|Limited|Corp(?:oration)?|Co\.|Pvt\.?|Mills|Railways?|Airlines?|Telecom|Authority|Institute|University|Commission|Board|Bank|Corporation))\b/g;
  const orgs = [
    ...new Set((submissionText.match(orgRe) || []).map(s => s.trim())),
  ].slice(0, 3);
  orgs.forEach(org => queries.push(`${org} Pakistan management case incident`));

  const uniqueQueries = [...new Set(queries)].slice(0, 5);
  if (uniqueQueries.length === 0) return null;

  console.log(`[webSearch] Running ${uniqueQueries.length} parallel searches…`);

  // Run all searches in parallel to minimise added latency
  const rawResults = await Promise.all(uniqueQueries.map(q => tavilySearch(q)));

  const results = uniqueQueries
    .map((q, i) => ({ query: q, data: rawResults[i] }))
    .filter(x => x.data)
    .map(({ query, data }) => ({
      query,
      answer: data.answer || null,
      snippets: (data.results || [])
        .slice(0, 2)
        .map(x => ({ content: x.content?.slice(0, 300), url: x.url }))
        .filter(x => x.content),
    }));

  if (results.length === 0) return null;

  const lines = [
    "## Web Search Context",
    "(Real-time internet search results — use these to verify the student's cited organizations, incidents, and references.)",
    "",
  ];

  results.forEach((r, i) => {
    lines.push(`### Search ${i + 1}: "${r.query}"`);
    if (r.answer) lines.push(`Summary: ${r.answer}`);
    r.snippets.forEach((s, j) => {
      lines.push(`Source ${j + 1} (${s.url}):`);
      lines.push(s.content);
    });
    lines.push("");
  });

  lines.push("---");
  lines.push(
    "GRADING NOTE: Use the search results above to assess whether each student-cited case is " +
    "real and from a legitimate organization. Award full marks when the incident is verifiable and " +
    "well-analysed; partial marks when the case is real but weakly connected to the question; " +
    "minimal marks when no verifiable evidence exists or the case appears fabricated."
  );

  return lines.join("\n");
}

module.exports = { buildWebSearchContext, isResearchAssignment };
