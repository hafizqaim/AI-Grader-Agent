import { useState } from "react";

const GRADE_STYLES = {
  A: "bg-green-100 text-green-800 ring-green-400",
  B: "bg-blue-100 text-blue-800 ring-blue-400",
  C: "bg-yellow-100 text-yellow-800 ring-yellow-400",
  D: "bg-orange-100 text-orange-800 ring-orange-400",
  F: "bg-red-100 text-red-800 ring-red-400",
};

const BAR_COLORS = {
  A: "bg-green-500",
  B: "bg-blue-500",
  C: "bg-yellow-500",
  D: "bg-orange-500",
  F: "bg-red-500",
};

function StudentCard({ result }) {
  const [expanded, setExpanded] = useState(false);
  const grade = result.grade || "F";
  const badgeStyle = GRADE_STYLES[grade] || GRADE_STYLES["F"];
  const barColor = BAR_COLORS[grade] || BAR_COLORS["F"];
  const pct = Math.min(100, Math.max(0, result.percentage || 0));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between gap-4 p-5">
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="truncate text-lg font-bold text-gray-900">
            {result.studentName || "Unknown Student"}
          </h3>
          <p className="text-sm text-gray-500">
            {result.totalScore} / {result.maxScore} marks
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-4 py-1 text-xl font-black ring-2 ring-inset ${badgeStyle}`}
        >
          {grade}
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-3">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Score</span>
          <span>{pct}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Overall comment */}
      <div className="border-t border-gray-100 px-5 py-3">
        <p className="text-sm text-gray-600 italic">{result.overallComment}</p>
      </div>

      {/* Expand/collapse criteria */}
      <div className="border-t border-gray-100 px-5 py-3">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
        >
          <span>{expanded ? "Hide" : "Show"} criterion-by-criterion feedback</span>
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <th className="border border-gray-200 px-3 py-2 w-1/4">Criterion</th>
                  <th className="border border-gray-200 px-3 py-2 text-center w-16">Score</th>
                  <th className="border border-gray-200 px-3 py-2 text-center w-16">Max</th>
                  <th className="border border-gray-200 px-3 py-2">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {(result.criteria || []).map((c, i) => (
                  <tr key={i} className="even:bg-gray-50">
                    <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800">
                      {c.name}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                      {c.score}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                      {c.maxScore}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-600">
                      {c.feedback}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * GradeReport
 * Props:
 *   results {Array} – array of grade result objects returned by the API
 */
export default function GradeReport({ results }) {
  if (!results || results.length === 0) return null;

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-2xl font-bold text-gray-900">Grade Results</h2>
      {results.map((result, i) => (
        <StudentCard key={i} result={result} />
      ))}
    </section>
  );
}
