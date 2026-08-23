import { useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Drag-and-drop file uploader.
 *
 * Props:
 *   label     {string}    – visible label
 *   sublabel  {string}    – small helper text under the label (e.g. accepted types)
 *   icon      {Component} – lucide icon rendered next to the label
 *   accept    {string}    – file accept string for the input, e.g. ".pdf,.docx"
 *   multiple  {boolean}   – allow multiple file selection
 *   optional  {boolean}   – shows an "optional" badge next to the label
 *   onChange  {function}  – called with a File (single) or File[] (multiple)
 */
export default function FileUploader({
  label,
  sublabel,
  icon: Icon = FileText,
  accept = ".pdf,.docx",
  multiple = false,
  optional = false,
  onChange,
}) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const fileArray = Array.from(fileList);
    setFiles(fileArray);
    onChange(multiple ? fileArray : fileArray[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (e, index) => {
    e.stopPropagation();
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
    onChange(multiple ? next : null);
  };

  const hasFiles = files.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
        {label}
        {optional && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400">optional</span>
        )}
      </label>
      {sublabel && <p className="-mt-1 text-[11px] text-slate-500">{sublabel}</p>}

      <div
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`group cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center transition-all duration-200
          ${dragging
            ? "border-brand-400 bg-brand-500/10 scale-[1.01]"
            : hasFiles
              ? "border-white/15 bg-white/[0.03]"
              : "border-white/10 bg-white/[0.02] hover:border-brand-400/50 hover:bg-brand-500/[0.06]"}`}
      >
        {!hasFiles ? (
          <>
            <UploadCloud
              className={`mx-auto mb-2 h-7 w-7 transition-colors ${dragging ? "text-brand-300" : "text-slate-600 group-hover:text-brand-400"}`}
              strokeWidth={1.5}
            />
            <p className="text-sm text-slate-400">
              <span className="font-semibold text-brand-300">Click to browse</span> or drag & drop
            </p>
          </>
        ) : (
          <ul className="space-y-1.5 text-left">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-brand-300" />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-200">{f.name}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{formatSize(f.size)}</span>
                <button
                  type="button"
                  onClick={(e) => removeFile(e, i)}
                  className="shrink-0 rounded-md p-0.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-red-300"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
