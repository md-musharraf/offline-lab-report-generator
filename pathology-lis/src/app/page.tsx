/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, CreditCard, Users, Beaker } from "lucide-react"
import { db } from "@/lib/db"

export default function Dashboard() {
  const [stats, setStats] = useState({
    patients: 0,
    orders: 0,
    tests: 0,
    revenue: 0,
  })

  useEffect(() => {
    async function loadStats() {
      try {
        const patients = await db.patient.count()
        const orders = await db.testOrder.count()
        const tests = await db.testOrderItem.count()
        
        // Use aggregate or just default to 0 for MVP
        setStats({
          patients,
          orders,
          tests,
          revenue: 0
        })
      } catch (error) {
        console.error("Failed to load stats via IPC:", error)
      }
    }
    
    // Only attempt to load if running in Electron (window.electron exists)
    if (typeof window !== 'undefined' && (window as any).electron) {
      loadStats()
    }
  }, [])

  return (
    <>
      <div className="flex items-center">
        <h1 className="text-lg font-semibold md:text-2xl">Dashboard</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        <Card x-chunk="dashboard-01-chunk-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹45,231.89</div>
            <p className="text-xs text-muted-foreground">
              +20.1% from last month
            </p>
          </CardContent>
        </Card>
        <Card x-chunk="dashboard-01-chunk-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Patients Registered
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{stats.patients}</div>
            <p className="text-xs text-muted-foreground">
              Total registered patients
            </p>
          </CardContent>
        </Card>
        <Card x-chunk="dashboard-01-chunk-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tests Performed</CardTitle>
            <Beaker className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{stats.tests}</div>
            <p className="text-xs text-muted-foreground">
              Total tests billed
            </p>
          </CardContent>
        </Card>
        <Card x-chunk="dashboard-01-chunk-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{stats.orders}</div>
            <p className="text-xs text-muted-foreground">
              Total orders registered
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="xl:col-span-2" x-chunk="dashboard-01-chunk-4">
          <CardHeader className="flex flex-row items-center">
            <div className="grid gap-2">
              <CardTitle>Recent Orders</CardTitle>
              <CardContent className="text-sm text-muted-foreground">
                Recent test orders from patients.
              </CardContent>
            </div>
          </CardHeader>
          <CardContent>
            {/* We will add the data table here later */}
            <div className="text-center text-muted-foreground py-10 border rounded-lg">
              No recent orders found.
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
