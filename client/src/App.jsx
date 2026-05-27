import { useState, useEffect } from "react";
import axios from "axios";
import FileUploader from "./components/FileUploader";
import GradeReport from "./components/GradeReport";
import LoadingSpinner from "./components/LoadingSpinner";
import PlagiarismReport from "./components/PlagiarismReport";

const API_BASE = "http://localhost:5000/api";

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
      if (data.errorGrades?.length > 0) {
        setError(
          `⚠️ ${data.errorGrades.length} submission(s) could not be graded (AI returned an unreadable response): ` +
          data.errorGrades.map(g => g.studentName).join(", ") +
          ". All other students were graded successfully."
        );
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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-4xl px-6 py-5 flex items-center gap-3">
          <span className="text-3xl">🎓</span>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 leading-tight">AI Assignment Grader</h1>
            <p className="text-sm text-gray-500">
              {backendInfo
                ? backendInfo.backend === "mistral"
                  ? `Powered by ${backendInfo.model} (Mistral API)`
                  : `Powered by ${backendInfo.model} (Ollama)`
                : "Powered by AI"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 flex flex-col gap-10">
        {/* ── Upload form ────────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
          <h2 className="mb-6 text-xl font-bold text-gray-800">Upload Documents</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FileUploader
                label="Assignment Task (PDF / DOCX)"
                accept=".pdf,.docx"
                multiple={false}
                onChange={setTaskFile}
              />
              <FileUploader
                label="Grading Rubric (PDF / DOCX)"
                accept=".pdf,.docx"
                multiple={false}
                onChange={setRubricFile}
              />
            </div>

            <FileUploader
              label="Student Submissions — select all at once (PDF / DOCX)"
              accept=".pdf,.docx"
              multiple={true}
              onChange={setSubmissionFiles}
            />

            <FileUploader
              label="Model Answer / Solution (PDF / DOCX) — optional but improves grading accuracy"
              accept=".pdf,.docx"
              multiple={false}
              onChange={setModelAnswerFile}
            />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <FileUploader
                  label="Naming File — roll numbers &amp; student data (XLSX / CSV)"
                  accept=".xlsx,.xls,.csv"
                  multiple={false}
                  onChange={setNamingFile}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-gray-700">
                  Marks Column
                  <span className="ml-1 font-normal text-gray-400">(column no. to fill)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 3"
                  value={markColumn}
                  onChange={(e) => setMarkColumn(e.target.value)}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <p className="text-xs text-gray-400">Column 1 = first column (A)</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-gray-700">
                  Total Marks
                  <span className="ml-1 font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 20"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <p className="text-xs text-gray-400">If rubric has no marks listed</p>
              </div>
            </div>

            {error && (() => {
              const isMistralAuth  = error.includes("MISTRAL_AUTH_ERROR");
              const isMistralQuota = error.includes("MISTRAL_QUOTA_EXCEEDED");
              const isMistralRate  = error.includes("MISTRAL_RATE_LIMIT");
              const cleanMsg = error
                .replace(/^MISTRAL_AUTH_ERROR:\s*/,  "")
                .replace(/^MISTRAL_QUOTA_EXCEEDED:\s*/, "")
                .replace(/^MISTRAL_RATE_LIMIT:\s*/, "");

              if (isMistralAuth) {
                return (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    <p className="font-bold mb-1">Mistral API Key Error</p>
                    <p>{cleanMsg}</p>
                    <p className="mt-1 text-red-500">Generate a key at{" "}
                      <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noreferrer" className="underline font-semibold">console.mistral.ai/api-keys</a>
                      {" "}and paste it into <code>server/.env</code> as <code>MISTRAL_API_KEY=...</code>
                    </p>
                  </div>
                );
              }
              if (isMistralQuota) {
                return (
                  <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-800">
                    <p className="font-bold mb-1">Mistral Free-Tier Monthly Limit Reached</p>
                    <p>{cleanMsg}</p>
                    <p className="mt-1 text-orange-600">Options:<br/>
                      • Add a payment method at{" "}
                      <a href="https://console.mistral.ai" target="_blank" rel="noreferrer" className="underline font-semibold">console.mistral.ai</a><br/>
                      • Or switch to Ollama: clear <code>MISTRAL_API_KEY</code> in <code>server/.env</code> and set <code>OLLAMA_BASE_URL</code> to your Colab ngrok URL.
                    </p>
                  </div>
                );
              }
              if (isMistralRate) {
                return (
                  <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
                    <p className="font-bold mb-1">Mistral Rate Limit Hit</p>
                    <p>{cleanMsg}</p>
                    <p className="mt-1 text-yellow-700">The free tier allows a limited number of requests per minute. Wait 60 seconds and try again, or upload fewer submissions per batch.</p>
                  </div>
                );
              }
              return (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <span className="font-semibold">Error: </span>{error}
                </div>
              );
            })()}

            <button
              type="submit"
              disabled={loading}
              className="self-start rounded-xl bg-blue-600 px-8 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Grading…" : "Grade Submissions"}
            </button>
          </form>
        </section>

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {loading && <LoadingSpinner />}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {!loading && results.length > 0 && (
          <>
            <PlagiarismReport pairs={plagiarism} />
            <GradeReport results={results} />

            {/* ── Download buttons ───────────────────────────────────────── */}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                onClick={handleDownloadMarks}
                className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-purple-700 active:bg-purple-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12v6m0 0l-3-3m3 3l3-3M12 4v8" />
                </svg>
                Download Updated Marks (XLSX)
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-green-700 active:bg-green-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12v6m0 0l-3-3m3 3l3-3M12 4v8" />
                </svg>
                Download Grade Report (DOCX)
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
