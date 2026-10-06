// Next patient ID / order number / bill number from the backend counter (atomic, never re-used).
export async function nextNumber(kind: 'patient' | 'order' | 'bill', date?: string): Promise<string> {
  const res = await fetch('/api/numbers/next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, date }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `Could not create a new ${kind} number`);
  return data.number;
}
