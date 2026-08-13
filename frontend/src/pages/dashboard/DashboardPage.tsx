import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Users, CalendarClock, BedDouble, Wallet } from 'lucide-react'
import { DashboardStatCard } from '@/components/dashboard/DashboardStatCard'
import { AdmissionsChart } from '@/components/dashboard/AdmissionsChart'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import { AppointmentsTable } from '@/components/dashboard/AppointmentsTable'
import { DoctorsOnDuty } from '@/components/dashboard/DoctorsOnDuty'
import { RecentPatients } from '@/components/dashboard/RecentPatients'
import { EmergencyAlerts } from '@/components/dashboard/EmergencyAlerts'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { listPatients } from '@/features/patients/api'
import { listAllAppointments } from '@/features/appointments/api'
import { listBeds } from '@/features/beds/api'
import { getRevenueThisMonth } from '@/features/billing/api'
import { formatCurrency } from '@/utils/currency'
import { ROUTES } from '@/constants/routes'

function isToday(isoDate: string): boolean {
  const date = new Date(isoDate)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [patientCount, setPatientCount] = useState<number | null>(null)
  const [todaysAppointmentCount, setTodaysAppointmentCount] = useState<number | null>(null)
  const [bedStats, setBedStats] = useState<{ available: number; total: number } | null>(null)
  const [revenue, setRevenue] = useState<number | null>(null)

  useEffect(() => {
    listPatients()
      .then((res) => setPatientCount(res.patients.length))
      .catch(() => setPatientCount(null))

    listAllAppointments()
      .then((res) => setTodaysAppointmentCount(res.appointments.filter((a) => isToday(a.scheduledAt)).length))
      .catch(() => setTodaysAppointmentCount(null))

    listBeds()
      .then((res) => setBedStats({ available: res.availableCount, total: res.totalCount }))
      .catch(() => setBedStats(null))

    getRevenueThisMonth()
      .then((res) => setRevenue(res.amount))
      .catch(() => setRevenue(null))
  }, [])

  const stats = [
    {
      label: 'Total Patients',
      value: patientCount === null ? '—' : patientCount.toLocaleString(),
      icon: Users,
      trend: 4.2,
      updatedLabel: 'Live count',
      onClick: () => navigate(ROUTES.patients),
    },
    {
      label: "Today's Appointments",
      value: todaysAppointmentCount === null ? '—' : String(todaysAppointmentCount),
      icon: CalendarClock,
      trend: 1.8,
      updatedLabel: 'Live count',
      onClick: () => navigate(ROUTES.appointments),
    },
    {
      label: 'Available Beds',
      value: bedStats === null ? '—' : `${bedStats.available} / ${bedStats.total}`,
      icon: BedDouble,
      trend: -2.1,
      updatedLabel: 'Live count',
      onClick: () => navigate(ROUTES.beds),
    },
    {
      label: 'Revenue (MTD)',
      value: revenue === null ? '—' : formatCurrency(revenue),
      icon: Wallet,
      trend: 6.5,
      updatedLabel: 'Live count',
      onClick: () => navigate(ROUTES.billing),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted">
          Welcome back — here&apos;s today&apos;s hospital overview.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className="animate-fade-in"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <DashboardStatCard {...stat} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="animate-fade-in">
          <AdmissionsChart />
        </div>
        <div className="animate-fade-in" style={{ animationDelay: '60ms' }}>
          <RevenueChart />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="animate-fade-in xl:col-span-2">
          <AppointmentsTable />
        </div>
        <div className="animate-fade-in" style={{ animationDelay: '60ms' }}>
          <DoctorsOnDuty />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="animate-fade-in">
          <RecentPatients />
        </div>
        <div className="animate-fade-in" style={{ animationDelay: '60ms' }}>
          <EmergencyAlerts />
        </div>
        <div className="animate-fade-in" style={{ animationDelay: '120ms' }}>
          <QuickActions />
        </div>
      </div>
    </div>
  )
}
