import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, Siren, Clock3, CheckCircle2, ListOrdered } from 'lucide-react'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { StatCard } from '@/components/ui/StatCard'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/features/auth/useAuth'
import { getEmergencyAnalytics, listEmergencies } from '@/features/emergency/api'
import { EmergencyStatusBadge } from '@/features/emergency/EmergencyStatusBadge'
import { EmergencyPriorityBadge } from '@/features/emergency/EmergencyPriorityBadge'
import { EmergencyVolumeChart } from '@/features/emergency/EmergencyVolumeChart'
import { ApiError } from '@/lib/apiClient'
import { buildEmergencyCaseUrl } from '@/constants/routes'
import {
  EMERGENCY_PRIORITIES,
  EMERGENCY_PRIORITY_LABELS,
  EMERGENCY_STATUSES,
  EMERGENCY_STATUS_LABELS,
  EMERGENCY_TYPE_LABELS,
  type EmergencyAnalytics,
  type EmergencyCaseSummary,
  type EmergencyPriority,
  type EmergencyStatus,
} from '@/types/emergency'

// Mirrors NotificationBell's 30s poll -- no dedicated realtime infra exists
// in this app, so the Emergency Center list refreshes itself on the same
// lightweight polling convention (see the plan's "Deferred: realtime" note).
const POLL_INTERVAL_MS = 15_000

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return 'N/A'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${(minutes / 60).toFixed(1)}h`
}

export function EmergencyCenterPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [cases, setCases] = useState<EmergencyCaseSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EmergencyStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<EmergencyPriority | 'all'>('all')
  const [analytics, setAnalytics] = useState<EmergencyAnalytics | null>(null)

  const isAdmin = user?.role === 'admin'

  function refresh() {
    listEmergencies({
      status: statusFilter === 'all' ? undefined : statusFilter,
      priority: priorityFilter === 'all' ? undefined : priorityFilter,
    })
      .then((res) => setCases(res.emergencyCases))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load emergency cases'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    setIsLoading(true)
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, priorityFilter])

  useEffect(() => {
    if (!isAdmin) return
    getEmergencyAnalytics()
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
  }, [isAdmin])

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return cases
    return cases.filter((c) => c.patientName.toLowerCase().includes(query))
  }, [cases, search])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink">
          <Siren className="size-6 text-danger-600" aria-hidden="true" />
          Emergency Center
        </h1>
        <p className="text-sm text-ink-muted">
          {filteredCases.length} case{filteredCases.length === 1 ? '' : 's'}
        </p>
      </div>

      {isAdmin && analytics && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="Total (30d)" value={String(analytics.totalCases)} icon={ListOrdered} />
            <StatCard label="Avg. Acknowledge" value={formatSeconds(analytics.avgAcknowledgeSeconds)} icon={Clock3} />
            <StatCard label="Avg. Assign" value={formatSeconds(analytics.avgAssignSeconds)} icon={Clock3} />
            <StatCard label="Avg. Response" value={formatSeconds(analytics.avgResponseSeconds)} icon={Clock3} />
            <StatCard label="Avg. Resolution" value={formatSeconds(analytics.avgResolutionSeconds)} icon={CheckCircle2} />
          </div>
          <EmergencyVolumeChart data={analytics.volumeByDay} />
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Input
            label="Search by patient"
            hideLabel
            icon={Search}
            placeholder="Search by patient name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="sm:w-48">
          <Select
            label="Filter by status"
            hideLabel
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as EmergencyStatus | 'all')}
            options={[
              { label: 'All statuses', value: 'all' },
              ...EMERGENCY_STATUSES.map((status) => ({ label: EMERGENCY_STATUS_LABELS[status], value: status })),
            ]}
          />
        </div>
        <div className="sm:w-40">
          <Select
            label="Filter by priority"
            hideLabel
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as EmergencyPriority | 'all')}
            options={[
              { label: 'All priorities', value: 'all' },
              ...EMERGENCY_PRIORITIES.map((priority) => ({ label: EMERGENCY_PRIORITY_LABELS[priority], value: priority })),
            ]}
          />
        </div>
      </div>

      {!isLoading && filteredCases.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={Search} title="No emergency cases" description="Cases matching your filters will show up here." />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCases.map((emergencyCase) => (
                <TableRow
                  key={emergencyCase.id}
                  className="cursor-pointer"
                  onClick={() => navigate(buildEmergencyCaseUrl(emergencyCase.id))}
                >
                  <TableCell className="font-medium text-ink">{emergencyCase.patientName}</TableCell>
                  <TableCell>{EMERGENCY_TYPE_LABELS[emergencyCase.emergencyType]}</TableCell>
                  <TableCell>
                    <EmergencyPriorityBadge priority={emergencyCase.priority} />
                  </TableCell>
                  <TableCell>
                    <EmergencyStatusBadge status={emergencyCase.status} />
                  </TableCell>
                  <TableCell>
                    {[emergencyCase.assignedDoctorName, emergencyCase.assignedStaffName, emergencyCase.assignedTeamName]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </TableCell>
                  <TableCell>{new Date(emergencyCase.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-brand-600">Open Case</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
