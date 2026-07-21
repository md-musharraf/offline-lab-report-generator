/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/lib/db"

export default function SampleCollectionPage() {
  const [orders, setOrders] = useState<any[]>([])
  
  useEffect(() => {
    async function fetchOrders() {
      if (typeof window !== 'undefined' && (window as any).electron) {
        try {
          const fetchedOrders = await db.testOrder.findMany({
            where: { status: "REGISTERED" },
            include: { patient: true }
          })
          setOrders(fetchedOrders || [])
        } catch (error) {
          console.error(error)
        }
      }
    }
    fetchOrders()
  }, [])

  const handleCollect = async (orderId: number) => {
    if (typeof window !== 'undefined' && (window as any).electron) {
      try {
        await db.testOrder.update({
          where: { id: orderId },
          data: { status: "COLLECTED" }
        })
        setOrders(orders.filter(o => o.id !== orderId))
        alert("Sample marked as collected. Printing Barcode...")
      } catch (error) {
        console.error(error)
      }
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Pending Sample Collections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-4">
            <Input placeholder="Search by Patient Name or Order No..." className="max-w-sm" />
            <Button variant="outline">Search</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order No</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Age/Gender</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    No pending collections.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.orderNo}</TableCell>
                    <TableCell>{order.patient?.name}</TableCell>
                    <TableCell>{order.patient?.age} {order.patient?.ageUnit} / {order.patient?.gender}</TableCell>
                    <TableCell>{order.status}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => handleCollect(order.id)}>Collect & Print Barcode</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
