import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Award } from "lucide-react";

const GRADE_STYLES = {
  A: { badge: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30", bar: "from-emerald-400 to-emerald-500", avatar: "from-emerald-400 to-teal-500" },
  B: { badge: "bg-sky-400/15 text-sky-300 ring-sky-400/30",             bar: "from-sky-400 to-blue-500",       avatar: "from-sky-400 to-blue-500" },
  C: { badge: "bg-amber-400/15 text-amber-300 ring-amber-400/30",       bar: "from-amber-400 to-yellow-500",   avatar: "from-amber-400 to-orange-400" },
  D: { badge: "bg-orange-400/15 text-orange-300 ring-orange-400/30",    bar: "from-orange-400 to-orange-500",  avatar: "from-orange-400 to-red-400" },
  F: { badge: "bg-red-400/15 text-red-300 ring-red-400/30",             bar: "from-red-400 to-rose-500",       avatar: "from-red-400 to-rose-500" },
};

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

function StudentCard({ result, index }) {
  const [expanded, setExpanded] = useState(false);
  const grade = result.grade || "F";
  const style = GRADE_STYLES[grade] || GRADE_STYLES["F"];
  const pct = Math.min(100, Math.max(0, result.percentage || 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.4), ease: "easeOut" }}
      className="glass-card rounded-2xl"
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${style.avatar} text-sm font-bold text-white shadow-md`}>
            {initials(result.studentName)}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="truncate text-base font-bold text-white">
              {result.studentName || "Unknown Student"}
            </h3>
            <p className="text-xs text-slate-400">
              {result.totalScore} / {result.maxScore} marks
            </p>
          </div>
        </div>

        <span className={`flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-lg font-black ring-1 ring-inset ${style.badge}`}>
          {grade}
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>Score</span>
          <span className="font-semibold text-slate-300">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
            className={`h-full rounded-full bg-gradient-to-r ${style.bar}`}
          />
        </div>
      </div>

      {/* Overall comment */}
      <div className="border-t border-white/5 px-5 py-3">
        <p className="text-sm italic text-slate-400">{result.overallComment}</p>
      </div>

      {/* Expand/collapse criteria */}
      <div className="border-t border-white/5 px-5 py-3">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between text-sm font-semibold text-brand-300 transition-colors hover:text-brand-200"
        >
          <span>{expanded ? "Hide" : "Show"} criterion-by-criterion feedback</span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </button>

        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.25 }}
            className="mt-3 overflow-x-auto"
          >
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="border-b border-white/10 px-3 py-2 w-1/4">Criterion</th>
                  <th className="border-b border-white/10 px-3 py-2 text-center w-16">Score</th>
                  <th className="border-b border-white/10 px-3 py-2 text-center w-16">Max</th>
                  <th className="border-b border-white/10 px-3 py-2">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {(result.criteria || []).map((c, i) => (
                  <tr key={i} className="odd:bg-white/[0.015]">
                    <td className="border-b border-white/5 px-3 py-2.5 font-medium text-slate-200">
                      {c.name}
                    </td>
                    <td className="border-b border-white/5 px-3 py-2.5 text-center text-slate-300">
                      {c.score}
                    </td>
                    <td className="border-b border-white/5 px-3 py-2.5 text-center text-slate-400">
                      {c.maxScore}
                    </td>
                    <td className="border-b border-white/5 px-3 py-2.5 text-slate-400">
                      {c.feedback}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </div>
    </motion.div>
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
      <div className="flex items-center gap-2.5">
        <Award className="h-5 w-5 text-brand-300" />
        <h2 className="font-display text-2xl font-bold text-white">Grade Results</h2>
        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-slate-400">{results.length}</span>
      </div>
      {results.map((result, i) => (
        <StudentCard key={i} result={result} index={i} />
      ))}
    </section>
  );
}
