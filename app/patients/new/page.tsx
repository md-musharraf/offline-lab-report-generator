"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

const patientSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  age: z.coerce.number().min(0).max(150),
  ageUnit: z.enum(["YEARS", "MONTHS", "DAYS"]),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  mobile: z.string().regex(/^[0-9]{10}$/, "Must be a valid 10-digit mobile number").optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  bloodGroup: z.string().optional(),
  emergencyContact: z.string().optional(),
  isEmergency: z.boolean().default(false),
  // Additional fields for billing/test selection can be added here
});

type PatientFormValues = z.infer<typeof patientSchema>;

export default function NewPatientPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { register, handleSubmit, formState: { errors } } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      ageUnit: "YEARS",
      gender: "MALE",
      isEmergency: false,
    }
  });

  const onSubmit = async (data: PatientFormValues) => {
    setIsSubmitting(true);
    try {
      // 1. Generate new Patient ID
      const today = new Date();
      const year = today.getFullYear();
      
      // Get count for this year to generate ID
      const countData = await db.query('patient', 'count', {
        where: { id: { startsWith: `LAB-${year}` } }
      });
      const count = (countData as number) || 0;
      const newId = `LAB-${year}-${String(count + 1).padStart(5, '0')}`;

      // 2. Save Patient
      await db.query('patient', 'create', {
        data: {
          id: newId,
          name: data.name,
          age: data.age,
          ageUnit: data.ageUnit,
          gender: data.gender,
          mobile: data.mobile || "",
          email: data.email || null,
          address: data.address,
          bloodGroup: data.bloodGroup,
          emergencyContact: data.emergencyContact,
          isEmergency: data.isEmergency,
          createdBy: 1, // hardcoded to admin seed user for now
        }
      });
      
      // Navigate to billing page for test selection
      router.push(`/billing/new?patientId=${newId}`);
    } catch (error) {
      console.error("Failed to register patient:", error);
      alert("Failed to register patient.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/patients" className="p-2 bg-white border rounded-md hover:bg-slate-50">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <h2 className="text-2xl font-bold text-slate-800">Register New Patient</h2>
      </div>

      <div className="bg-white rounded-lg border shadow-sm p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Full Name *</label>
              <input 
                {...register("name")} 
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                placeholder="John Doe"
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Mobile Number (Optional)</label>
              <input 
                {...register("mobile")} 
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                placeholder="9876543210"
              />
              {errors.mobile && <p className="mt-1 text-sm text-red-600">{errors.mobile.message}</p>}
            </div>

            {/* Age */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Age *</label>
                <input 
                  type="number"
                  {...register("age")} 
                  className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                  placeholder="30"
                />
                {errors.age && <p className="mt-1 text-sm text-red-600">{errors.age.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Unit *</label>
                <select 
                  {...register("ageUnit")}
                  className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white"
                >
                  <option value="YEARS">Years</option>
                  <option value="MONTHS">Months</option>
                  <option value="DAYS">Days</option>
                </select>
              </div>
            </div>

            {/* Gender */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Gender *</label>
              <select 
                {...register("gender")}
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Email Address (Optional)</label>
              <input 
                {...register("email")} 
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                placeholder="john@example.com"
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
            </div>

            {/* Blood Group */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Blood Group (Optional)</label>
              <select 
                {...register("bloodGroup")}
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white"
              >
                <option value="">Select</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>
            
            {/* Address */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Address (Optional)</label>
              <textarea 
                {...register("address")} 
                rows={2}
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                placeholder="123 Main St, City"
              />
            </div>
            
            {/* Emergency Info */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Emergency Contact (Optional)</label>
              <input 
                {...register("emergencyContact")} 
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                placeholder="Name - Phone"
              />
            </div>

            <div className="flex items-center pt-6">
              <input
                id="isEmergency"
                type="checkbox"
                {...register("isEmergency")}
                className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
              />
              <label htmlFor="isEmergency" className="ml-2 block text-sm font-medium text-red-700">
                Mark as Emergency Case (Requires immediate attention)
              </label>
            </div>
          </div>

          <div className="pt-5 border-t border-slate-200 flex justify-end gap-3">
            <Link 
              href="/patients"
              className="bg-white py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : (
                <>
                  <Save className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                  Save Patient
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
