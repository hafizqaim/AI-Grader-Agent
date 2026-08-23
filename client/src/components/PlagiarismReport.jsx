import { motion } from "framer-motion";
import { ShieldCheck, Search } from "lucide-react";

const SEVERITY_STYLES = {
  HIGH:   { badge: "bg-red-400/15 text-red-300 ring-red-400/30",       bar: "from-red-400 to-rose-500",     label: "High Risk" },
  MEDIUM: { badge: "bg-orange-400/15 text-orange-300 ring-orange-400/30", bar: "from-orange-400 to-amber-400", label: "Medium Risk" },
  LOW:    { badge: "bg-yellow-400/15 text-yellow-300 ring-yellow-400/30", bar: "from-yellow-400 to-amber-300", label: "Low Risk" },
};

/**
 * PlagiarismReport
 * Props:
 *   pairs {Array} – array of { student1, student2, similarity, severity }
 */
export default function PlagiarismReport({ pairs }) {
  if (!pairs || pairs.length === 0) {
    return (
      <section className="glass-card rounded-2xl border-emerald-400/20 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h2 className="text-base font-bold text-emerald-300">No Plagiarism Detected</h2>
            <p className="text-sm text-slate-400">All submissions appear sufficiently distinct from one another.</p>
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
      <div className="glass-card flex flex-col gap-4 rounded-2xl border-red-400/15 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-400/10">
            <Search className="h-5 w-5 text-red-300" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">Plagiarism Detection Results</h2>
            <p className="text-sm text-slate-400">
              {pairs.length} suspicious {pairs.length === 1 ? "pair" : "pairs"} found
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {highCount > 0 && (
            <span className="rounded-full bg-red-400/15 px-3 py-1 text-xs font-bold text-red-300 ring-1 ring-inset ring-red-400/30">
              {highCount} High
            </span>
          )}
          {mediumCount > 0 && (
            <span className="rounded-full bg-orange-400/15 px-3 py-1 text-xs font-bold text-orange-300 ring-1 ring-inset ring-orange-400/30">
              {mediumCount} Medium
            </span>
          )}
          {lowCount > 0 && (
            <span className="rounded-full bg-yellow-400/15 px-3 py-1 text-xs font-bold text-yellow-300 ring-1 ring-inset ring-yellow-400/30">
              {lowCount} Low
            </span>
          )}
        </div>
      </div>

      {/* Pair cards */}
      {pairs.map((pair, i) => {
        const style = SEVERITY_STYLES[pair.severity] || SEVERITY_STYLES.LOW;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.3) }}
            className="glass-card rounded-2xl px-5 py-4"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* Student names */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex min-w-0 flex-col items-center gap-1">
                  <span className="max-w-[140px] truncate font-bold text-white">{pair.student1}</span>
                  <span className="text-[11px] text-slate-500">Roll No.</span>
                </div>
                <span className="shrink-0 text-lg font-bold text-slate-600">↔</span>
                <div className="flex min-w-0 flex-col items-center gap-1">
                  <span className="max-w-[140px] truncate font-bold text-white">{pair.student2}</span>
                  <span className="text-[11px] text-slate-500">Roll No.</span>
                </div>
              </div>

              {/* Similarity bar + scores */}
              <div className="flex flex-col gap-1 sm:w-64">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Overall Similarity</span>
                  <span className="font-bold text-slate-200">{pair.similarity}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${style.bar}`}
                    style={{ width: `${pair.similarity}%` }}
                  />
                </div>
                {/* Individual method scores */}
                <div className="mt-0.5 flex justify-between text-[11px] text-slate-500">
                  <span>Verbatim: <span className="font-medium text-slate-300">{pair.jaccardScore}%</span></span>
                  <span>Paraphrase: <span className="font-medium text-slate-300">{pair.tfidfScore}%</span></span>
                </div>
              </div>

              {/* Severity + method badges */}
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${style.badge}`}>
                  {style.label}
                </span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-slate-400">
                  {pair.method}
                </span>
              </div>
            </div>
          </motion.div>
        );
      })}

      <p className="text-right text-[11px] text-slate-600">
        Detection: Jaccard k-shingle (verbatim) + TF-IDF cosine (paraphrase) &nbsp;|&nbsp; Threshold ≥ 20%
      </p>
    </section>
  );
}
