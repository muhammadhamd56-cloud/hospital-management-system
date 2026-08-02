import { useState } from 'react'
import { UserPlus, CalendarPlus, Stethoscope, ReceiptText, FlaskConical } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AddPatientModal } from '@/features/patients/AddPatientModal'
import { AddDoctorModal } from '@/features/doctors/AddDoctorModal'
import { BookAppointmentModal } from '@/features/appointments/BookAppointmentModal'
import { CreateInvoiceModal } from '@/features/billing/CreateInvoiceModal'
import { RequestLabTestModal } from '@/features/laboratory/RequestLabTestModal'

type ActionKey = 'patient' | 'appointment' | 'doctor' | 'invoice' | 'labTest'

const ACTIONS: { key: ActionKey; label: string; icon: LucideIcon }[] = [
  { key: 'patient', label: 'Add Patient', icon: UserPlus },
  { key: 'appointment', label: 'Schedule Appointment', icon: CalendarPlus },
  { key: 'doctor', label: 'Add Doctor', icon: Stethoscope },
  { key: 'invoice', label: 'Generate Invoice', icon: ReceiptText },
  { key: 'labTest', label: 'Order Lab Test', icon: FlaskConical },
]

export function QuickActions() {
  const [openAction, setOpenAction] = useState<ActionKey | null>(null)

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Jump straight into a common task.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {ACTIONS.map((action) => (
          <Button
            key={action.key}
            variant="secondary"
            onClick={() => setOpenAction(action.key)}
            className="justify-start transition-transform active:scale-[0.98]"
          >
            <action.icon className="size-4" aria-hidden="true" />
            {action.label}
          </Button>
        ))}
      </CardContent>

      <AddPatientModal
        isOpen={openAction === 'patient'}
        onClose={() => setOpenAction(null)}
        onAdd={() => setOpenAction(null)}
      />
      <BookAppointmentModal
        isOpen={openAction === 'appointment'}
        onClose={() => setOpenAction(null)}
        onBook={() => setOpenAction(null)}
      />
      <AddDoctorModal
        isOpen={openAction === 'doctor'}
        onClose={() => setOpenAction(null)}
        onAdd={() => setOpenAction(null)}
      />
      <CreateInvoiceModal
        isOpen={openAction === 'invoice'}
        onClose={() => setOpenAction(null)}
        onCreate={() => setOpenAction(null)}
      />
      <RequestLabTestModal
        isOpen={openAction === 'labTest'}
        onClose={() => setOpenAction(null)}
        onRequest={() => setOpenAction(null)}
      />
    </Card>
  )
}
