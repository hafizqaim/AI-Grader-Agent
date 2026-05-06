import { useRef, useState } from "react";

/**
 * Drag-and-drop file uploader.
 *
 * Props:
 *   label     {string}   – visible label
 *   accept    {string}   – file accept string for the input, e.g. ".pdf,.docx"
 *   multiple  {boolean}  – allow multiple file selection
 *   onChange  {function} – called with a File (single) or File[] (multiple)
 */
export default function FileUploader({ label, accept = ".pdf,.docx", multiple = false, onChange }) {
  const inputRef = useRef(null);
  const [fileNames, setFileNames] = useState([]);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setFileNames(fileArray.map((f) => f.name));
    if (multiple) {
      onChange(fileArray);
    } else {
      onChange(fileArray[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-gray-700">{label}</label>
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-150
          ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"}`}
      >
        <svg
          className="mx-auto mb-2 h-8 w-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4"
          />
        </svg>
        {fileNames.length === 0 ? (
          <p className="text-sm text-gray-500">
            Drag & drop or <span className="font-medium text-blue-600">browse</span>
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-left">
            {fileNames.map((name, i) => (
              <li key={i} className="truncate text-sm font-medium text-blue-700">
                📄 {name}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-gray-400">Accepted: PDF, DOCX</p>
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
