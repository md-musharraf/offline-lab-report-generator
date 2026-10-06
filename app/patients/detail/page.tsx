"use client";
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';
import { db } from '@/lib/db';
import { Plus, FileText, CreditCard, Phone, Droplet, MapPin, CalendarDays, ChevronRight } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  ENTERED: 'bg-primary/10 text-primary',
  VERIFIED: 'bg-green-600/10 text-green-700 dark:text-green-400',
  COMPLETED: 'bg-green-600/10 text-green-700 dark:text-green-400',
};

function PatientDetailContent() {
  const id = useSearchParams().get('id') as string;
  const router = useRouter();
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    db.query('patient', 'findUnique', {
      where: { id },
      include: {
        orders: { include: { items: { include: { test: true } } }, orderBy: { createdAt: 'desc' } },
        bills: { orderBy: { createdAt: 'desc' } },
      },
    })
      .then(setPatient)
      .catch(err => console.error('Failed to load patient', err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading patient…</div>;
  if (!patient) return <div className="p-6 text-sm text-muted-foreground">Patient not found.</div>;

  const due = (patient.bills || []).reduce((sum: number, b: any) => sum + (b.dueAmount || 0), 0);
  const facts = [
    { icon: Phone, label: 'Mobile', value: patient.mobile || '—' },
    { icon: Droplet, label: 'Blood group', value: patient.bloodGroup || '—' },
    { icon: CalendarDays, label: 'Registered', value: new Date(patient.registeredAt).toLocaleString() },
    { icon: MapPin, label: 'Address', value: patient.address || '—' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
          {patient.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xl font-semibold">{patient.name}</h2>
            {patient.isEmergency && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">EMERGENCY</span>}
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{patient.id}</span> · {patient.age} {String(patient.ageUnit).toLowerCase()} · {patient.gender}
            {patient.referredDoctor ? ` · Ref: ${patient.referredDoctor}` : ''}
          </p>
        </div>
        {due > 0 && (
          <div className="ml-auto rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground">Balance due</div>
            <div className="font-semibold text-amber-700 dark:text-amber-400">₹{due.toLocaleString('en-IN')}</div>
          </div>
        )}
        <button
          onClick={() => router.push(`/billing/new?patientId=${encodeURIComponent(patient.id)}`)}
          className={`${due > 0 ? '' : 'ml-auto '}inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90`}
        >
          <Plus className="h-4 w-4" /> New test order
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {facts.map(f => (
          <div key={f.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><f.icon className="h-3.5 w-3.5" />{f.label}</div>
            <div className="mt-1 truncate text-sm font-medium" title={f.value}>{f.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="font-semibold">Orders</h3>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </header>
          {patient.orders?.length ? (
            <ul className="divide-y">
              {patient.orders.map((order: any) => (
                <li key={order.id}>
                  <button
                    onClick={() => router.push(`/results/entry?orderId=${order.id}`)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-medium text-primary">{order.orderNo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()} · {order.items?.map((i: any) => i.test?.shortName || i.test?.name).join(', ')}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[order.status] || 'bg-muted text-muted-foreground'}`}>{order.status}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-muted-foreground">No orders yet.</p>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="font-semibold">Bills</h3>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </header>
          {patient.bills?.length ? (
            <ul className="divide-y">
              {patient.bills.map((bill: any) => (
                <li key={bill.id}>
                  <button onClick={() => router.push('/billing')} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-medium">{bill.billNo}</p>
                      <p className="text-xs text-muted-foreground">{new Date(bill.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">₹{Number(bill.totalAmount).toLocaleString('en-IN')}</p>
                      <p className={`text-xs font-medium ${bill.paymentStatus === 'PAID' ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>{bill.paymentStatus}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-muted-foreground">No bills yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function PatientDetailPage() {
  return (
    <AppLayout title="Patient" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Patients', href: '/patients' }, { label: 'Details' }]}>
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading patient…</div>}>
        <PatientDetailContent />
      </Suspense>
    </AppLayout>
  );
}
