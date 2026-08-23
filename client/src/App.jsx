import { useState, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap,
  Sparkles,
  FileText,
  ClipboardList,
  Users,
  FileCheck2,
  Hash,
  Target,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  Search,
  Globe,
  Loader2,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import FileUploader from "./components/FileUploader";
import GradeReport from "./components/GradeReport";
import LoadingSpinner from "./components/LoadingSpinner";
import PlagiarismReport from "./components/PlagiarismReport";

const API_BASE = "http://localhost:5000/api";

const FEATURE_CHIPS = [
  { icon: FileCheck2, label: "Rubric-aware grading" },
  { icon: Search, label: "Plagiarism detection" },
  { icon: FileSpreadsheet, label: "One-click DOCX / XLSX export" },
];

export default function App() {
  const [taskFile, setTaskFile] = useState(null);
  const [rubricFile, setRubricFile] = useState(null);
  const [submissionFiles, setSubmissionFiles] = useState([]);
  const [namingFile, setNamingFile] = useState(null);
  const [modelAnswerFile, setModelAnswerFile] = useState(null);
  const [markColumn, setMarkColumn] = useState("");
  const [totalMarks, setTotalMarks] = useState("");
  const [results, setResults] = useState([]);
  const [plagiarism, setPlagiarism] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [backendInfo, setBackendInfo] = useState(null);

  useEffect(() => {
    axios.get("http://localhost:5000/api/status")
      .then(({ data }) => setBackendInfo(data))
      .catch(() => {}); // silently ignore — the badge just won't show
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResults([]);
    setPlagiarism([]);

    if (!taskFile) { setError("Please upload the assignment task file."); return; }
    if (!rubricFile) { setError("Please upload the grading rubric file."); return; }
    if (submissionFiles.length === 0) { setError("Please upload at least one student submission."); return; }
    if (!namingFile) { setError("Please upload the naming file (Excel / CSV)."); return; }
    if (!markColumn || isNaN(parseInt(markColumn)) || parseInt(markColumn) < 1) {
      setError("Please enter a valid column number (e.g. 3) where marks should be filled.");
      return;
    }

    const formData = new FormData();
    formData.append("task", taskFile);
    formData.append("rubric", rubricFile);
    submissionFiles.forEach((f) => formData.append("submissions", f));
    formData.append("namingFile", namingFile);
    formData.append("markColumn", markColumn);
    if (totalMarks && parseInt(totalMarks) > 0) {
      formData.append("totalMarks", totalMarks);
    }
    if (modelAnswerFile) {
      formData.append("modelAnswer", modelAnswerFile);
    }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/grade`, formData);
      // Note: do NOT set Content-Type manually for FormData — the browser must
      // set it automatically so it includes the correct multipart boundary.
      setResults(data.grades);
      setPlagiarism(data.plagiarism || []);

      // Combine warnings about skipped (unreadable) files and AI-grading failures into one message
      const warnings = [];
      if (data.skipped?.length > 0) {
        warnings.push(
          `⚠️ ${data.skipped.length} submission(s) skipped — could not extract readable text ` +
          `(likely scanned images or image-only PDFs): ` +
          data.skipped.map(s => s.studentName).join(", ")
        );
      }
      if (data.errorGrades?.length > 0) {
        warnings.push(
          `⚠️ ${data.errorGrades.length} submission(s) could not be graded (AI returned an unreadable response): ` +
          data.errorGrades.map(g => g.studentName).join(", ")
        );
      }
      if (warnings.length > 0) {
        setError(warnings.join("\n\n") + "\n\nAll other students were graded successfully.");
      }
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        "An unexpected error occurred. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    window.open(`${API_BASE}/download`, "_blank");
  };

  const handleDownloadMarks = () => {
    window.open(`${API_BASE}/download-marks`, "_blank");
  };

  return (
    <div className="relative min-h-screen text-slate-100">
      {/* ── Ambient background ─────────────────────────────────────────── */}
      <div className="aurora-bg">
        <div className="aurora-blob h-96 w-96 bg-brand-500/60 -top-20 -left-20" />
        <div className="aurora-blob h-[28rem] w-[28rem] bg-accent-500/40 top-1/3 -right-32" style={{ animationDelay: "-6s" }} />
        <div className="aurora-blob h-80 w-80 bg-fuchsia-500/25 bottom-0 left-1/3" style={{ animationDelay: "-11s" }} />
      </div>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 shadow-lg shadow-brand-500/30">
              <GraduationCap className="h-[22px] w-[22px] text-white" strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="font-display text-base font-bold leading-tight text-white sm:text-lg">
                AI Assignment Grader
              </h1>
              <p className="text-[11px] font-medium text-slate-400 sm:text-xs">
                Grading, at the speed of thought
              </p>
            </div>
          </div>

          {backendInfo && (
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 sm:inline-flex">
                <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                {backendInfo.backend === "mistral"
                  ? `${backendInfo.model} · Mistral`
                  : `${backendInfo.model} · Ollama`}
              </span>
              {backendInfo.webSearch && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                  <Globe className="h-3.5 w-3.5" />
                  Web Search
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col gap-14 px-6 pb-24 pt-14">
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-center gap-6 text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-brand-300">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered grading, built for real classrooms
          </span>

          <h2 className="max-w-2xl font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl">
            Grade a whole class in
            <span className="text-gradient"> minutes, not hours</span>
          </h2>

          <p className="max-w-xl text-balance text-sm text-slate-400 sm:text-base">
            Upload the task, rubric, and submissions — Claude grades every student
            criterion-by-criterion, flags similar submissions, and hands you a
            ready-to-send report.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {FEATURE_CHIPS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-slate-300"
              >
                <Icon className="h-3.5 w-3.5 text-accent-400" />
                {label}
              </span>
            ))}
          </div>
        </motion.section>

        {/* ── Upload form ────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="glass-panel rounded-3xl p-6 shadow-2xl shadow-black/40 sm:p-9"
        >
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
              <ClipboardList className="h-[18px] w-[18px] text-brand-300" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-white">Upload Documents</h3>
              <p className="text-xs text-slate-400">Everything needed to grade this batch</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FileUploader
                label="Assignment Task"
                sublabel="PDF / DOCX"
                icon={FileText}
                accept=".pdf,.docx"
                multiple={false}
                onChange={setTaskFile}
              />
              <FileUploader
                label="Grading Rubric"
                sublabel="PDF / DOCX"
                icon={Target}
                accept=".pdf,.docx"
                multiple={false}
                onChange={setRubricFile}
              />
            </div>

            <FileUploader
              label="Student Submissions"
              sublabel="Select all at once · PDF / DOCX"
              icon={Users}
              accept=".pdf,.docx"
              multiple={true}
              onChange={setSubmissionFiles}
            />

            <FileUploader
              label="Model Answer / Solution"
              sublabel="Optional, but improves grading accuracy · PDF / DOCX"
              icon={FileCheck2}
              accept=".pdf,.docx"
              multiple={false}
              onChange={setModelAnswerFile}
              optional
            />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <FileUploader
                  label="Naming File"
                  sublabel="Roll numbers & student data · XLSX / CSV"
                  icon={FileSpreadsheet}
                  accept=".xlsx,.xls,.csv"
                  multiple={false}
                  onChange={setNamingFile}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                  <Hash className="h-3.5 w-3.5 text-slate-500" />
                  Marks Column
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 3"
                  value={markColumn}
                  onChange={(e) => setMarkColumn(e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-brand-400/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-brand-400/20"
                />
                <p className="text-[11px] text-slate-500">Column 1 = first column (A)</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                  <Target className="h-3.5 w-3.5 text-slate-500" />
                  Total Marks
                  <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 20"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-brand-400/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-brand-400/20"
                />
                <p className="text-[11px] text-slate-500">If rubric has no marks listed</p>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {(() => {
                    const isMistralAuth  = error.includes("MISTRAL_AUTH_ERROR");
                    const isMistralQuota = error.includes("MISTRAL_QUOTA_EXCEEDED");
                    const isMistralRate  = error.includes("MISTRAL_RATE_LIMIT");
                    const cleanMsg = error
                      .replace(/^MISTRAL_AUTH_ERROR:\s*/,  "")
                      .replace(/^MISTRAL_QUOTA_EXCEEDED:\s*/, "")
                      .replace(/^MISTRAL_RATE_LIMIT:\s*/, "");

                    if (isMistralAuth) {
                      return (
                        <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                          <p className="mb-1 flex items-center gap-1.5 font-bold text-red-100"><AlertTriangle className="h-4 w-4" /> Mistral API Key Error</p>
                          <p>{cleanMsg}</p>
                          <p className="mt-1 text-red-300/80">Generate a key at{" "}
                            <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noreferrer" className="underline font-semibold text-red-200">console.mistral.ai/api-keys</a>
                            {" "}and paste it into <code>server/.env</code> as <code>MISTRAL_API_KEY=...</code>
                          </p>
                        </div>
                      );
                    }
                    if (isMistralQuota) {
                      return (
                        <div className="rounded-xl border border-orange-400/20 bg-orange-400/10 px-4 py-3 text-sm text-orange-200">
                          <p className="mb-1 flex items-center gap-1.5 font-bold text-orange-100"><AlertTriangle className="h-4 w-4" /> Mistral Free-Tier Monthly Limit Reached</p>
                          <p>{cleanMsg}</p>
                          <p className="mt-1 text-orange-300/80">Options:<br/>
                            • Add a payment method at{" "}
                            <a href="https://console.mistral.ai" target="_blank" rel="noreferrer" className="underline font-semibold text-orange-200">console.mistral.ai</a><br/>
                            • Or switch to Ollama: clear <code>MISTRAL_API_KEY</code> in <code>server/.env</code> and set <code>OLLAMA_BASE_URL</code> to your Colab ngrok URL.
                          </p>
                        </div>
                      );
                    }
                    if (isMistralRate) {
                      return (
                        <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-200">
                          <p className="mb-1 flex items-center gap-1.5 font-bold text-yellow-100"><AlertTriangle className="h-4 w-4" /> Mistral Rate Limit Hit</p>
                          <p>{cleanMsg}</p>
                          <p className="mt-1 text-yellow-300/80">The free tier allows a limited number of requests per minute. Wait 60 seconds and try again, or upload fewer submissions per batch.</p>
                        </div>
                      );
                    }
                    return (
                      <div className="whitespace-pre-line rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                        <span className="font-semibold text-red-100">Error: </span>{error}
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="group relative self-start overflow-hidden rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-500/25 transition-all hover:shadow-xl hover:shadow-brand-500/35 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="relative z-10 flex items-center gap-2">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Grading…
                  </>
                ) : (
                  <>
                    Grade Submissions
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </span>
            </button>
          </form>
        </motion.section>

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LoadingSpinner />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Results ─────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {!loading && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex flex-col gap-10"
            >
              <PlagiarismReport pairs={plagiarism} />
              <GradeReport results={results} />

              {/* ── Download buttons ───────────────────────────────────────── */}
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  onClick={handleDownloadMarks}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-slate-100 shadow-sm transition-colors hover:bg-white/10"
                >
                  <FileSpreadsheet className="h-4 w-4 text-fuchsia-300" />
                  Download Updated Marks (XLSX)
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:shadow-xl hover:shadow-emerald-500/30"
                >
                  <Download className="h-4 w-4" />
                  Download Grade Report (DOCX)
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <footer className="mt-6 flex flex-col items-center gap-3 border-t border-white/5 pt-8 text-center">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-600" />
            Built with React · Node.js · Claude
          </div>
          <p className="text-[11px] text-slate-600">AI Assignment Grader — designed for fast, consistent, defensible grading.</p>
        </footer>
      </main>
    </div>
  );
}
