import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Inbox, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { RespondApplicationModal } from '@/features/staffScheduling/RespondApplicationModal'
import { ApplicationStatusBadge } from '@/features/staffPortal/ApplicationStatusBadge'
import { ShiftTypeBadge } from '@/features/staffScheduling/ShiftTypeBadge'
import { listShiftApplications } from '@/features/staffScheduling/api'
import type { ApplicationStatus, ShiftApplication } from '@/types/staffPortal'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ApplicationsPanel() {
  const [applications, setApplications] = useState<ShiftApplication[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('pending')
  const [responding, setResponding] = useState<{ application: ShiftApplication; decision: 'approve' | 'reject' } | null>(
    null,
  )

  function refresh() {
    setIsLoading(true)
    setLoadError(false)
    listShiftApplications()
      .then((res) => setApplications(res.applications))
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  const filtered = useMemo(() => {
    const sorted = [...applications].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
    if (statusFilter === 'all') return sorted
    return sorted.filter((application) => application.status === statusFilter)
  }, [applications, statusFilter])

  function handleResponded(application: ShiftApplication) {
    setApplications((current) => current.map((item) => (item.id === application.id ? application : item)))
    setResponding(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">Review and respond to staff shift applications.</p>
        <div className="sm:w-48">
          <Select
            label="Status"
            hideLabel
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ApplicationStatus | 'all')}
            options={[
              { label: 'Pending', value: 'pending' },
              { label: 'Approved', value: 'approved' },
              { label: 'Rejected', value: 'rejected' },
              { label: 'Withdrawn', value: 'withdrawn' },
              { label: 'All statuses', value: 'all' },
            ]}
          />
        </div>
      </div>

      {loadError && !isLoading ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={AlertTriangle} title="Unable to load applications." description="Something went wrong." />
          <div className="flex justify-center pb-6">
            <Button onClick={refresh}>Try Again</Button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={Inbox} title="No applications here." description="Nothing matches this filter." />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((application) => (
                <TableRow key={application.id}>
                  <TableCell className="font-medium text-ink">{application.staff.fullName}</TableCell>
                  <TableCell>
                    <ShiftTypeBadge shiftType={application.opening.shiftType} />
                  </TableCell>
                  <TableCell>{formatDate(application.opening.date)}</TableCell>
                  <TableCell>{application.opening.department ?? '—'}</TableCell>
                  <TableCell>
                    <ApplicationStatusBadge status={application.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {application.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => setResponding({ application, decision: 'approve' })}
                          aria-label="Approve"
                        >
                          <Check className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setResponding({ application, decision: 'reject' })}
                          aria-label="Reject"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RespondApplicationModal
        application={responding?.application ?? null}
        decision={responding?.decision ?? null}
        onClose={() => setResponding(null)}
        onResponded={handleResponded}
      />
    </div>
  )
}
