"use client";
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft, Plus, FileText, CreditCard } from 'lucide-react';

function PatientDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') as string;
  const router = useRouter();
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPatient() {
      try {
        const data = await db.query('patient', 'findUnique', {
          where: { id },
          include: {
            orders: true,
            bills: true
          }
        });
        if (data) {
          setPatient(data);
        } else {
          // not found
        }
      } catch (error) {
        console.error("Failed to load patient", error);
      } finally {
        setLoading(false);
      }
    }
    if (id) loadPatient();
  }, [id]);

  if (loading) return <div className="p-6">Loading patient details...</div>;
  if (!patient) return <div className="p-6">Patient not found</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/patients" className="p-2 bg-white border rounded-md hover:bg-slate-50">
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </Link>
          <h2 className="text-2xl font-bold text-slate-800">Patient Details</h2>
        </div>
        <div className="flex space-x-3">
          <button onClick={() => router.push(`/billing/new?patientId=${patient.id}`)} className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
            <Plus className="-ml-1 mr-2 h-5 w-5" />
            New Test Order (Billing)
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-2xl">
              {patient.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
              <p className="text-sm text-gray-500 font-mono">{patient.id}</p>
            </div>
            {patient.isEmergency && (
              <span className="ml-4 px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold animate-pulse">
                EMERGENCY
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div>
              <p className="text-sm text-gray-500">Age / Gender</p>
              <p className="font-medium">{patient.age} {patient.ageUnit} / {patient.gender}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Mobile</p>
              <p className="font-medium">{patient.mobile}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">{patient.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Blood Group</p>
              <p className="font-medium">{patient.bloodGroup || 'N/A'}</p>
            </div>
          </div>
        </div>
        
        <div className="border-l pl-6 space-y-4">
          <div>
            <p className="text-sm text-gray-500">Registered On</p>
            <p className="font-medium">{new Date(patient.registeredAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Address</p>
            <p className="font-medium">{patient.address || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Emergency Contact</p>
            <p className="font-medium">{patient.emergencyContact || 'N/A'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-medium">Recent Orders</h3>
            <FileText className="h-5 w-5 text-gray-400" />
          </div>
          <ul className="divide-y divide-gray-200">
            {patient.orders?.length === 0 ? (
              <li className="px-6 py-4 text-sm text-gray-500">No orders found.</li>
            ) : (
              patient.orders?.map((order: any) => (
                <li key={order.id} className="px-6 py-4 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/results/entry?orderId=${order.id}`)}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-blue-600">{order.orderNo}</p>
                      <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                      {order.status}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-medium">Billing History</h3>
            <CreditCard className="h-5 w-5 text-gray-400" />
          </div>
          <ul className="divide-y divide-gray-200">
            {patient.bills?.length === 0 ? (
              <li className="px-6 py-4 text-sm text-gray-500">No bills found.</li>
            ) : (
              patient.bills?.map((bill: any) => (
                <li key={bill.id} className="px-6 py-4 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/billing/${bill.id}`)}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{bill.billNo}</p>
                      <p className="text-xs text-gray-500">{new Date(bill.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">₹{bill.totalAmount}</p>
                      <span className={`text-xs ${bill.paymentStatus === 'PAID' ? 'text-green-600' : 'text-red-600'}`}>
                        {bill.paymentStatus}
                      </span>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function PatientDetailPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading patient details...</div>}>
      <PatientDetailContent />
    </Suspense>
  );
}
