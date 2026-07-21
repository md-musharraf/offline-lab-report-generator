/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { db } from "@/lib/db"
import { useEffect } from "react"

const patientSchema = z.object({
  name: z.string().min(2, "Name is required"),
  age: z.number().min(0, "Invalid age"),
  ageUnit: z.string(),
  gender: z.string(),
  mobile: z.string().optional(),
})

export default function RegistrationPage() {
  const [availableTests, setAvailableTests] = useState<{id: number, name: string, price: number}[]>([])
  const [cart, setCart] = useState<{id: number, name: string, price: number}[]>([])

  useEffect(() => {
    async function loadTests() {
      if (typeof window !== 'undefined' && (window as any).electron) {
        try {
          const tests = await db.test.findMany({})
          setAvailableTests(tests)
        } catch (error) {
          console.error("Failed to load tests", error)
        }
      }
    }
    loadTests()
  }, [])

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      name: "",
      age: 0,
      ageUnit: "Y",
      gender: "Male",
      mobile: ""
    }
  })

  const onSubmit = async (data: any) => {
    if (cart.length === 0) {
      alert("Please add at least one test to the cart.")
      return
    }

    try {
      if (typeof window !== 'undefined' && (window as any).electron) {
        // Create Patient and Order
        const patientIdStr = `LAB-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`
        
        const patient = await db.patient.create({
          data: {
            patientId: patientIdStr,
            name: data.name,
            age: data.age,
            ageUnit: data.ageUnit,
            gender: data.gender,
            mobile: data.mobile,
          }
        })

        const orderNoStr = `ORD-${new Date().getTime()}`
        
        const order = await db.testOrder.create({
          data: {
            orderNo: orderNoStr,
            patientId: patient.id,
            status: "REGISTERED",
            priority: "ROUTINE",
            collectionType: "WALK_IN",
            items: {
              create: cart.map(test => ({
                testId: test.id,
                status: "PENDING",
                price: test.price
              }))
            },
            billing: {
              create: {
                billNo: `BILL-${new Date().getTime()}`,
                subtotal: cart.reduce((acc, t) => acc + t.price, 0),
                total: cart.reduce((acc, t) => acc + t.price, 0),
                status: "DUE"
              }
            }
          }
        })
        
        alert(`Successfully registered Order: ${order.orderNo}`)
        setCart([])
      }
    } catch (error) {
      console.error("Failed to register patient", error)
      alert("Failed to register patient.")
    }
  }

  const addToCart = (test: any) => {
    if (!cart.find(t => t.id === test.id)) {
      setCart([...cart, test])
    }
  }

  const removeFromCart = (testId: number) => {
    setCart(cart.filter(t => t.id !== testId))
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Patient Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input {...register("name")} placeholder="Patient Name" />
              {errors.name && <p className="text-sm text-red-500">{errors.name.message as string}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Age</label>
                <div className="flex gap-2">
                  <Input type="number" {...register("age", { valueAsNumber: true })} />
                  <Select defaultValue="Y">
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Y">Yrs</SelectItem>
                      <SelectItem value="M">Mos</SelectItem>
                      <SelectItem value="D">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Gender</label>
                <Select defaultValue="Male">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mobile</label>
              <Input {...register("mobile")} placeholder="Phone Number" />
            </div>
            <Button type="submit" className="w-full">Register & Proceed to Bill</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col gap-2 max-h-40 overflow-y-auto border rounded p-2">
              {availableTests.map(test => (
                <div key={test.id} className="flex justify-between items-center text-sm">
                  <span>{test.name} - ₹{test.price}</span>
                  <Button variant="outline" size="sm" onClick={() => addToCart(test)}>Add</Button>
                </div>
              ))}
            </div>
            
            <div className="border rounded-lg min-h-[150px] p-4 text-sm flex flex-col gap-2">
              {cart.length === 0 ? (
                <div className="text-center text-muted-foreground m-auto">No tests selected</div>
              ) : (
                cart.map(test => (
                  <div key={test.id} className="flex justify-between items-center border-b pb-2">
                    <span>{test.name}</span>
                    <div className="flex items-center gap-4">
                      <span>₹{test.price}</span>
                      <Button variant="destructive" size="sm" onClick={() => removeFromCart(test.id)}>Remove</Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-between font-bold text-lg pt-4 border-t">
              <span>Total</span>
              <span>₹{cart.reduce((acc, t) => acc + t.price, 0).toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
