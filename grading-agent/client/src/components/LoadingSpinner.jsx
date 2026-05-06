export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="h-14 w-14 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      <p className="text-base font-medium text-gray-600">
        Grading submissions with AI&hellip; this may take a moment.
      </p>
    </div>
  );
}
