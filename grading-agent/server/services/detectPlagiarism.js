/**
 * Plagiarism detection — dual-method approach:
 *
 *  Method A — Jaccard shingling (verbatim copy detection)
 *    Builds overlapping k-word shingle sets and computes |A∩B|/|A∪B|.
 *    Catches copy-paste, minor edits, sentence reordering.
 *
 *  Method B — TF-IDF cosine similarity (paraphrase detection)
 *    Represents each document as a weighted vocabulary vector (stop words removed,
 *    IDF discounts common terms across all submissions). Cosine angle between
 *    two vectors catches vocabulary reuse even when phrasing is different.
 *
 *  Final similarity = max(Jaccard, TF-IDF cosine).
 *  Each pair reports which method drove the score so teachers know what type
 *  of plagiarism is suspected.
 */

const SHINGLE_SIZE    = 6;     // words per shingle for Method A
const MIN_THRESHOLD   = 0.20;  // pairs below 20 % are not reported

// ── Stop words ───────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","was","are","were","be","been","being","have","has","had","do",
  "does","did","will","would","could","should","may","might","shall","can",
  "this","that","these","those","it","its","we","our","you","your","they",
  "their","he","his","she","her","i","my","me","us","am","not","as","if","so",
  "up","out","no","any","all","both","each","few","more","most","other","some",
  "such","than","then","when","where","who","which","what","how","about","into",
  "through","during","before","after","above","below","between","under","again",
  "further","once","here","there","very","just","because","while","although",
  "however","therefore","thus","also","well","per","via","etc","also","upon",
]);

// ── Shared normalisation ──────────────────────────────────────────────────────
function normaliseText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenise(text) {
  return normaliseText(text).split(" ").filter(Boolean);
}

function tokeniseNoStopWords(text) {
  return tokenise(text).filter((w) => !STOP_WORDS.has(w));
}

// ── Method A: Jaccard shingling ───────────────────────────────────────────────
function buildShingles(text, k = SHINGLE_SIZE) {
  const words = tokenise(text);
  const shingles = new Set();
  for (let i = 0; i <= words.length - k; i++) {
    shingles.add(words.slice(i, i + k).join(" "));
  }
  return shingles;
}

function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const s of setA) {
    if (setB.has(s)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Method B: TF-IDF cosine similarity ───────────────────────────────────────

/** Build a term-frequency map for one document */
function buildTF(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

/**
 * Build IDF weights across the entire corpus.
 * idf(t) = log((N + 1) / (df(t) + 1)) + 1  (smoothed)
 */
function buildIDF(tfMaps) {
  const N = tfMaps.length;
  const df = new Map();
  for (const tf of tfMaps) {
    for (const term of tf.keys()) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }
  const idf = new Map();
  for (const [term, count] of df) {
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
  }
  return idf;
}

/** Build a TF-IDF vector (Map<term, weight>) for one document */
function buildTFIDF(tf, idf) {
  const vec = new Map();
  for (const [term, freq] of tf) {
    const idfVal = idf.get(term) || 1;
    vec.set(term, freq * idfVal);
  }
  return vec;
}

/** Cosine similarity between two Map-based vectors */
function cosine(vecA, vecB) {
  let dot = 0, magA = 0, magB = 0;
  for (const [term, valA] of vecA) {
    dot += valA * (vecB.get(term) || 0);
    magA += valA * valA;
  }
  for (const valB of vecB.values()) magB += valB * valB;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * @param {Array<{ name: string, text: string }>} submissions
 * @returns {Array<{ student1, student2, similarity, jaccardScore, tfidfScore, method, severity }>}
 */
function detectPlagiarism(submissions) {
  if (submissions.length < 2) return [];

  // Pre-compute shingle sets (Method A)
  const shingleSets = submissions.map((s) => buildShingles(s.text));

  // Pre-compute TF-IDF vectors (Method B)
  const tokenSets  = submissions.map((s) => tokeniseNoStopWords(s.text));
  const tfMaps     = tokenSets.map(buildTF);
  const idf        = buildIDF(tfMaps);
  const tfidfVecs  = tfMaps.map((tf) => buildTFIDF(tf, idf));

  const pairs = [];

  for (let i = 0; i < submissions.length; i++) {
    for (let j = i + 1; j < submissions.length; j++) {
      const jaccardScore = jaccard(shingleSets[i], shingleSets[j]);
      const tfidfScore   = cosine(tfidfVecs[i], tfidfVecs[j]);

      const sim = Math.max(jaccardScore, tfidfScore);
      if (sim < MIN_THRESHOLD) continue;

      const similarity = Math.round(sim * 1000) / 10;
      const jPct       = Math.round(jaccardScore * 1000) / 10;
      const tPct       = Math.round(tfidfScore   * 1000) / 10;

      // Which method drove the score?
      const method = jaccardScore >= tfidfScore
        ? "Exact / Near-Verbatim Copy"
        : "Paraphrase / Vocabulary Overlap";

      let severity;
      if (similarity >= 70) severity = "HIGH";
      else if (similarity >= 40) severity = "MEDIUM";
      else severity = "LOW";

      pairs.push({
        student1: submissions[i].name,
        student2: submissions[j].name,
        similarity,
        jaccardScore: jPct,
        tfidfScore: tPct,
        method,
        severity,
      });
    }
  }

  return pairs.sort((a, b) => b.similarity - a.similarity);
}

module.exports = { detectPlagiarism };

