import { useNavigate } from 'react-router'
import {
  UserSearch,
  CalendarPlus,
  CalendarCheck,
  FileText,
  Pill,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { Card, CardContent } from '@/components/ui/Card'
import { ROUTES } from '@/constants/routes'

interface QuickLink {
  label: string
  description: string
  icon: LucideIcon
  path: string
}

const QUICK_LINKS: QuickLink[] = [
  {
    label: 'Find a Doctor',
    description: 'Search doctors by name or specialization',
    icon: UserSearch,
    path: ROUTES.findDoctor,
  },
  {
    label: 'Book Appointment',
    description: 'Schedule a new session',
    icon: CalendarPlus,
    path: ROUTES.bookAppointment,
  },
  {
    label: 'My Appointments',
    description: 'View upcoming and past sessions',
    icon: CalendarCheck,
    path: ROUTES.myAppointments,
  },
  {
    label: 'Medical Records',
    description: 'Your diagnoses and visit history',
    icon: FileText,
    path: ROUTES.medicalRecords,
  },
  {
    label: 'Prescriptions',
    description: 'Medications prescribed to you',
    icon: Pill,
    path: ROUTES.prescriptions,
  },
  {
    label: 'Messages',
    description: 'Chat with your care team',
    icon: MessageCircle,
    path: ROUTES.messages,
  },
]

export function PatientDashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Welcome back, {user?.fullName}</h1>
        <p className="text-sm text-ink-muted">What would you like to do today?</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {QUICK_LINKS.map((link, index) => (
          <div key={link.path} className="animate-fade-in" style={{ animationDelay: `${index * 60}ms` }}>
            <Card
              className="h-full cursor-pointer transition-colors hover:bg-surface-alt"
              onClick={() => navigate(link.path)}
            >
              <CardContent className="flex items-start gap-4 py-5">
                <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <link.icon className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium text-ink">{link.label}</p>
                  <p className="text-sm text-ink-muted">{link.description}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
