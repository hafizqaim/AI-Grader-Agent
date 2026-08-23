import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const MESSAGES = [
  "Reading assignment task & rubric…",
  "Comparing submissions against the model answer…",
  "Scoring criterion-by-criterion…",
  "Scanning for similarity across submissions…",
  "Compiling feedback…",
];

export default function LoadingSpinner() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % MESSAGES.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="glass-panel flex flex-col items-center justify-center gap-5 rounded-3xl py-14 px-6">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/10 border-t-brand-400" style={{ animationDuration: "1.1s" }} />
        <div className="absolute inset-2 animate-spin rounded-full border-4 border-white/5 border-t-accent-400" style={{ animationDuration: "1.6s", animationDirection: "reverse" }} />
        <Sparkles className="h-5 w-5 text-brand-300" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-200">Grading submissions with AI</p>
        <p className="mt-1 text-xs text-slate-500 transition-opacity duration-300">{MESSAGES[step]}</p>
      </div>
      <div className="h-1 w-56 overflow-hidden rounded-full bg-white/5">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 shimmer" />
      </div>
    </div>
  );
}
