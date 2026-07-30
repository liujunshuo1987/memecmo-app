'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print-hide text-xs px-4 py-2 rounded-lg bg-brand text-on-brand font-medium hover:brightness-110 transition"
    >
      导出 PDF · Export PDF
    </button>
  );
}
