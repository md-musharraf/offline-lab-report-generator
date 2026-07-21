"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"

export default function InventoryPage() {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Inventory Management</CardTitle>
          <Button size="sm">Add Reagent</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reagent Name</TableHead>
                <TableHead>Batch No</TableHead>
                <TableHead>Stock (Tests)</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Glucose Kit</TableCell>
                <TableCell>B-4921</TableCell>
                <TableCell>450</TableCell>
                <TableCell>2026-10-15</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800">Sufficient</span>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>CBC Analyzer Buffer</TableCell>
                <TableCell>H-1109</TableCell>
                <TableCell>20</TableCell>
                <TableCell>2026-06-20</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-800">Low Stock</span>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Thyroid Profile (TSH)</TableCell>
                <TableCell>T-3392</TableCell>
                <TableCell>0</TableCell>
                <TableCell>2026-01-05</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800">Out of Stock</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
