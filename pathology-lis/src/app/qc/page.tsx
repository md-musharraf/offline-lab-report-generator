"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function QCPage() {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Quality Control (QC)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground mb-4">
            Levey-Jennings / Westgard Rules Monitoring
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Control Name</TableHead>
                <TableHead>Target Value</TableHead>
                <TableHead>Current Value</TableHead>
                <TableHead>SD</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>L1 Chemistry</TableCell>
                <TableCell>100</TableCell>
                <TableCell>102</TableCell>
                <TableCell>+0.5 SD</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800">Pass</span>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>L2 Hematology</TableCell>
                <TableCell>14.0</TableCell>
                <TableCell>16.2</TableCell>
                <TableCell>+2.2 SD</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800">Violation (1-2s)</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
