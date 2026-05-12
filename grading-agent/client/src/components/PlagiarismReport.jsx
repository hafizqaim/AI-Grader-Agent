const SEVERITY_STYLES = {
  HIGH:   { badge: "bg-red-100 text-red-700 ring-red-400",    bar: "bg-red-500",    label: "High Risk" },
  MEDIUM: { badge: "bg-orange-100 text-orange-700 ring-orange-400", bar: "bg-orange-400", label: "Medium Risk" },
  LOW:    { badge: "bg-yellow-100 text-yellow-700 ring-yellow-400", bar: "bg-yellow-400", label: "Low Risk" },
};

/**
 * PlagiarismReport
 * Props:
 *   pairs {Array} – array of { student1, student2, similarity, severity }
 */
export default function PlagiarismReport({ pairs }) {
  if (!pairs || pairs.length === 0) {
    return (
      <section className="rounded-2xl bg-white border border-green-200 shadow-sm p-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <h2 className="text-lg font-bold text-green-800">No Plagiarism Detected</h2>
            <p className="text-sm text-green-600">All submissions appear sufficiently distinct from one another.</p>
          </div>
        </div>
      </section>
    );
  }

  const highCount   = pairs.filter((p) => p.severity === "HIGH").length;
  const mediumCount = pairs.filter((p) => p.severity === "MEDIUM").length;
  const lowCount    = pairs.filter((p) => p.severity === "LOW").length;

  return (
    <section className="flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-2xl bg-red-50 border border-red-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔍</span>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Plagiarism Detection Results</h2>
            <p className="text-sm text-gray-500">
              {pairs.length} suspicious {pairs.length === 1 ? "pair" : "pairs"} found
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {highCount > 0 && (
            <span className="rounded-full bg-red-100 text-red-700 ring-1 ring-red-400 px-3 py-1 text-xs font-bold">
              {highCount} High
            </span>
          )}
          {mediumCount > 0 && (
            <span className="rounded-full bg-orange-100 text-orange-700 ring-1 ring-orange-400 px-3 py-1 text-xs font-bold">
              {mediumCount} Medium
            </span>
          )}
          {lowCount > 0 && (
            <span className="rounded-full bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400 px-3 py-1 text-xs font-bold">
              {lowCount} Low
            </span>
          )}
        </div>
      </div>

      {/* Pair cards */}
      {pairs.map((pair, i) => {
        const style = SEVERITY_STYLES[pair.severity] || SEVERITY_STYLES.LOW;
        return (
          <div key={i} className="rounded-2xl bg-white border border-gray-200 shadow-sm px-5 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Student names */}
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <div className="flex flex-col items-center gap-1 min-w-0">
                  <span className="font-bold text-gray-900 truncate max-w-[140px]">{pair.student1}</span>
                  <span className="text-xs text-gray-400">Roll No.</span>
                </div>
                <span className="text-gray-400 font-bold text-lg shrink-0">↔</span>
                <div className="flex flex-col items-center gap-1 min-w-0">
                  <span className="font-bold text-gray-900 truncate max-w-[140px]">{pair.student2}</span>
                  <span className="text-xs text-gray-400">Roll No.</span>
                </div>
              </div>

              {/* Similarity bar + scores */}
              <div className="flex flex-col gap-1 sm:w-64">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Overall Similarity</span>
                  <span className="font-bold text-gray-800">{pair.similarity}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${style.bar}`}
                    style={{ width: `${pair.similarity}%` }}
                  />
                </div>
                {/* Individual method scores */}
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>Verbatim: <span className="font-medium text-gray-600">{pair.jaccardScore}%</span></span>
                  <span>Paraphrase: <span className="font-medium text-gray-600">{pair.tfidfScore}%</span></span>
                </div>
              </div>

              {/* Severity + method badges */}
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${style.badge}`}>
                  {style.label}
                </span>
                <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">
                  {pair.method}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-gray-400 text-right">
        Detection: Jaccard k-shingle (verbatim) + TF-IDF cosine (paraphrase) &nbsp;|&nbsp; Threshold ≥ 20%
      </p>
    </section>
  );
}
