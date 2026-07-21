import React from 'react';

export default function NotFound() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-200">
      <h2 className="text-2xl font-bold tracking-tight">404 - Page Not Found</h2>
      <p className="mt-2 text-sm text-slate-400">The requested page could not be found.</p>
    </div>
  );
}
