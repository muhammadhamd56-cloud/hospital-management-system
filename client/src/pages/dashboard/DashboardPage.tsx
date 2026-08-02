import { Users, CalendarClock, BedDouble, Wallet, CalendarX } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'

const STATS = [
  { label: 'Total Patients', value: '2,481', icon: Users, trend: 4.2 },
  { label: "Today's Appointments", value: '36', icon: CalendarClock, trend: 1.8 },
  { label: 'Available Beds', value: '54 / 120', icon: BedDouble, trend: -2.1 },
  { label: 'Revenue (MTD)', value: '$128,940', icon: Wallet, trend: 6.5 },
]

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted">
          Welcome back — here&apos;s what&apos;s happening across the hospital today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Appointments</CardTitle>
          <CardDescription>
            Appointment scheduling isn&apos;t connected yet — this will populate once the
            Appointments module ships.
          </CardDescription>
        </CardHeader>
        <EmptyState
          icon={CalendarX}
          title="No appointments to show"
          description="Booked appointments will appear here in real time."
        />
      </Card>
    </div>
  )
}
