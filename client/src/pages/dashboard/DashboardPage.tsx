import { Users, CalendarClock, BedDouble, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { DashboardStatCard } from '@/components/dashboard/DashboardStatCard'
import { AdmissionsChart } from '@/components/dashboard/AdmissionsChart'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import { AppointmentsTable } from '@/components/dashboard/AppointmentsTable'
import { DoctorsOnDuty } from '@/components/dashboard/DoctorsOnDuty'
import { RecentPatients } from '@/components/dashboard/RecentPatients'
import { EmergencyAlerts } from '@/components/dashboard/EmergencyAlerts'
import { QuickActions } from '@/components/dashboard/QuickActions'

const STATS = [
  {
    label: 'Total Patients',
    value: '2,481',
    icon: Users,
    trend: 4.2,
    updatedLabel: 'Updated 2 mins ago',
  },
  {
    label: "Today's Appointments",
    value: '36',
    icon: CalendarClock,
    trend: 1.8,
    updatedLabel: 'Updated 5 mins ago',
  },
  {
    label: 'Available Beds',
    value: '54 / 120',
    icon: BedDouble,
    trend: -2.1,
    updatedLabel: 'Updated just now',
  },
  {
    label: 'Revenue (MTD)',
    value: '$128,940',
    icon: Wallet,
    trend: 6.5,
    updatedLabel: 'Updated 10 mins ago',
  },
]

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted">
          Welcome back — here&apos;s today&apos;s hospital overview.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat, index) => (
          <div
            key={stat.label}
            className="animate-fade-in"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <DashboardStatCard
              {...stat}
              onClick={() => toast(`${stat.label} details are coming soon`)}
            />
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
