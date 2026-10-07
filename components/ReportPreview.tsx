"use client";
// Report PDFs come from the backend (POST /api/reports/pdf): the frozen copy once a report is approved,
// current data for a draft. The preview shows that same PDF, so what you see is what prints.
import { useEffect, useState } from 'react';
import { Loader2, XIcon } from 'lucide-react';

export async function reportPdfUrl(orderIds: number[], preview = false) {
  const res = await fetch('/api/reports/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds, preview }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not make the report PDF');
  return URL.createObjectURL(await res.blob());
}

export async function downloadReportPdf(orderIds: number[], filename: string) {
  const url = await reportPdfUrl(orderIds);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function ReportPreview({ orderId, title, onClose, children }: { orderId: number; title: string; onClose: () => void; children?: React.ReactNode }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let made = '';
    setUrl('');
    setError('');
    reportPdfUrl([orderId], true).then(u => setUrl((made = u))).catch(e => setError(e.message));
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [orderId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Report preview" className="flex h-[92vh] w-full max-w-4xl flex-col rounded-xl border bg-card p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Report Preview</h2>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
          <button onClick={onClose} aria-label="Close preview" className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden rounded-lg border bg-muted/40">
          {url ? (
            <iframe title="Report PDF" src={url} className="h-full w-full" />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              {error ? <span className="text-destructive">{error}</span> : <><Loader2 className="h-4 w-4 animate-spin" />Preparing the report...</>}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {children}
          <button onClick={onClose} className="ml-auto rounded-xl border px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-accent">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
