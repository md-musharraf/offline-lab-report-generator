/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/lib/db"

export default function ResultsPage() {
  const [barcode, setBarcode] = useState("")
  const [order, setOrder] = useState<any>(null)

  const handleSearch = async () => {
    if (!barcode) return
    try {
      if (typeof window !== 'undefined' && (window as any).electron) {
        // Find order by orderNo
        const fetchedOrders = await db.testOrder.findMany({
          where: { orderNo: barcode },
          include: { items: { include: { test: { include: { parameters: true } } } }, patient: true }
        })
        if (fetchedOrders && fetchedOrders.length > 0) {
          setOrder(fetchedOrders[0])
        } else {
          alert("Order not found")
          setOrder(null)
        }
      }
    } catch (error) {
      console.error(error)
      alert("Error fetching order")
    }
  }

  const handleSave = async (status: string) => {
    if (!order) return
    try {
      if (typeof window !== 'undefined' && (window as any).electron) {
        await db.testOrder.update({
          where: { id: order.id },
          data: { status: status }
        })
        alert(`Order marked as ${status}`)
      }
    } catch (error) {
      console.error(error)
      alert("Error saving results")
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Result Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Scan Barcode or Enter Order ID..."
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="max-w-sm"
            />
            <Button onClick={handleSearch}>Search</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parameter</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Reference Range</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order ? (
                order.items.flatMap((item: any) => 
                  item.test.parameters.map((param: any) => (
                    <TableRow key={param.id}>
                      <TableCell>{param.name}</TableCell>
                      <TableCell>
                        <Input type="number" className="w-24" placeholder="Value" />
                      </TableCell>
                      <TableCell>{param.unit}</TableCell>
                      <TableCell>{param.minRange} - {param.maxRange}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-800">
                          Pending
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    Search for an order to enter results
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {order && (
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleSave("PARTIAL")}>Save Draft</Button>
              <Button onClick={() => handleSave("COMPLETED")}>Submit Results</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
