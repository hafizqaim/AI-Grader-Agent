/**
 * Plagiarism detection via word-level k-shingling + Jaccard similarity.
 *
 * The algorithm:
 *  1. Normalise text (lowercase, strip punctuation, collapse whitespace)
 *  2. Build a set of overlapping k-word shingles for each submission
 *  3. Compute Jaccard similarity for every unique pair: |A ∩ B| / |A ∪ B|
 *  4. Return all pairs above the minimum threshold, sorted by similarity desc
 */

const SHINGLE_SIZE = 6;       // number of consecutive words per shingle
const MIN_THRESHOLD = 0.20;   // pairs below 20 % are not reported

/** Lowercase, strip non-alphanumeric, collapse spaces */
function normaliseText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a Set of overlapping k-word shingles from a text string */
function buildShingles(text, k = SHINGLE_SIZE) {
  const words = normaliseText(text).split(" ").filter(Boolean);
  const shingles = new Set();
  for (let i = 0; i <= words.length - k; i++) {
    shingles.add(words.slice(i, i + k).join(" "));
  }
  return shingles;
}

/** Jaccard similarity between two Sets */
function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const s of setA) {
    if (setB.has(s)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Detects plagiarism among a list of submissions.
 *
 * @param {Array<{ name: string, text: string }>} submissions
 * @returns {Array<{ student1, student2, similarity, severity }>}
 *   Pairs sorted from highest to lowest similarity (only pairs >= MIN_THRESHOLD)
 */
function detectPlagiarism(submissions) {
  const shingleSets = submissions.map((s) => buildShingles(s.text));
  const pairs = [];

  for (let i = 0; i < submissions.length; i++) {
    for (let j = i + 1; j < submissions.length; j++) {
      const sim = jaccard(shingleSets[i], shingleSets[j]);
      if (sim < MIN_THRESHOLD) continue;

      const percentage = Math.round(sim * 1000) / 10; // 1 decimal place

      let severity;
      if (percentage >= 70) severity = "HIGH";
      else if (percentage >= 40) severity = "MEDIUM";
      else severity = "LOW";

      pairs.push({
        student1: submissions[i].name,
        student2: submissions[j].name,
        similarity: percentage,
        severity,
      });
    }
  }

  return pairs.sort((a, b) => b.similarity - a.similarity);
}

module.exports = { detectPlagiarism };
