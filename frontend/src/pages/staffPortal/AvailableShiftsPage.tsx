import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus, Inbox } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { ApplyShiftModal } from '@/features/staffPortal/ApplyShiftModal'
import { ApplicationStatusBadge } from '@/features/staffPortal/ApplicationStatusBadge'
import { ShiftTypeBadge } from '@/features/staffScheduling/ShiftTypeBadge'
import { listAvailableShifts, listMyApplications, withdrawMyApplication } from '@/features/staffPortal/api'
import { ApiError } from '@/lib/apiClient'
import type { ShiftApplication, ShiftOpening } from '@/types/staffPortal'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function AvailableShiftsPage() {
  const [openings, setOpenings] = useState<ShiftOpening[]>([])
  const [applications, setApplications] = useState<ShiftApplication[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [applyingTo, setApplyingTo] = useState<ShiftOpening | null>(null)
  const [withdrawing, setWithdrawing] = useState<ShiftApplication | null>(null)
  const [isMutating, setIsMutating] = useState(false)

  function refresh() {
    setIsLoading(true)
    setLoadError(false)
    Promise.all([listAvailableShifts(), listMyApplications()])
      .then(([openingsRes, applicationsRes]) => {
        setOpenings(openingsRes.openings)
        setApplications(applicationsRes.applications)
      })
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  const openOpenings = useMemo(
    () => openings.filter((opening) => opening.isOpen).sort((a, b) => a.date.localeCompare(b.date)),
    [openings],
  )

  const sortedApplications = useMemo(
    () => [...applications].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)),
    [applications],
  )

  function handleApplied(application: ShiftApplication) {
    setApplications((current) => [application, ...current])
    setOpenings((current) =>
      current.map((opening) =>
        opening.id === application.opening.id ? { ...opening, myApplicationStatus: application.status } : opening,
      ),
    )
    toast.success('Application submitted')
    setApplyingTo(null)
  }

  async function handleWithdraw() {
    if (!withdrawing) return

    setIsMutating(true)
    try {
      const result = await withdrawMyApplication(withdrawing.id)
      setApplications((current) => current.map((app) => (app.id === result.application.id ? result.application : app)))
      setOpenings((current) =>
        current.map((opening) =>
          opening.id === result.application.opening.id ? { ...opening, myApplicationStatus: 'withdrawn' } : opening,
        ),
      )
      toast.success('Application withdrawn')
      setWithdrawing(null)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to withdraw application')
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Available Shifts</h1>
        <p className="text-sm text-ink-muted">Browse open shifts and track your applications.</p>
      </div>

      {loadError && !isLoading ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={AlertTriangle} title="Unable to load shifts." description="Something went wrong. Please try again." />
          <div className="flex justify-center pb-6">
            <Button onClick={refresh}>Try Again</Button>
          </div>
        </div>
      ) : (
        <Tabs defaultTab="available">
          <TabsList>
            <TabsTrigger value="available">Available ({openOpenings.length})</TabsTrigger>
            <TabsTrigger value="applications">My Applications ({applications.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="available">
            {isLoading ? (
              <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
            ) : openOpenings.length === 0 ? (
              <div className="rounded-card border border-surface-border bg-surface">
                <EmptyState icon={CalendarPlus} title="No open shifts right now." description="Check back later for new openings." />
              </div>
            ) : (
              <div className="rounded-card border border-surface-border bg-surface">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Positions</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openOpenings.map((opening) => {
                      const applied = opening.myApplicationStatus && opening.myApplicationStatus !== 'withdrawn'
                      const full = opening.approvedCount >= opening.positions
                      const deadlinePassed = new Date(opening.applicationDeadline).getTime() < Date.now()
                      return (
                        <TableRow key={opening.id}>
                          <TableCell>{formatDate(opening.date)}</TableCell>
                          <TableCell>
                            <ShiftTypeBadge shiftType={opening.shiftType} />
                          </TableCell>
                          <TableCell>
                            {formatTime(opening.startTime)}–{formatTime(opening.endTime)}
                          </TableCell>
                          <TableCell>{opening.department ?? '—'}</TableCell>
                          <TableCell>
                            {opening.approvedCount}/{opening.positions}
                          </TableCell>
                          <TableCell>{formatDate(opening.applicationDeadline)}</TableCell>
                          <TableCell className="text-right">
                            {applied ? (
                              <ApplicationStatusBadge status={opening.myApplicationStatus!} />
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => setApplyingTo(opening)}
                                disabled={full || deadlinePassed}
                              >
                                {full ? 'Full' : deadlinePassed ? 'Closed' : 'Apply'}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="applications">
            {isLoading ? (
              <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
            ) : sortedApplications.length === 0 ? (
              <div className="rounded-card border border-surface-border bg-surface">
                <EmptyState icon={Inbox} title="No applications yet." description="Apply to an available shift to see it here." />
              </div>
            ) : (
              <div className="rounded-card border border-surface-border bg-surface">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Applied</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedApplications.map((application) => (
                      <TableRow key={application.id}>
                        <TableCell>{formatDate(application.opening.date)}</TableCell>
                        <TableCell>
                          <ShiftTypeBadge shiftType={application.opening.shiftType} />
                        </TableCell>
                        <TableCell>{application.opening.department ?? '—'}</TableCell>
                        <TableCell>
                          <ApplicationStatusBadge status={application.status} />
                        </TableCell>
                        <TableCell>{formatDate(application.appliedAt)}</TableCell>
                        <TableCell className="text-right">
                          {application.status === 'pending' && (
                            <Button size="sm" variant="secondary" onClick={() => setWithdrawing(application)}>
                              Withdraw
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <ApplyShiftModal opening={applyingTo} onClose={() => setApplyingTo(null)} onApplied={handleApplied} />

      <ConfirmDialog
        isOpen={withdrawing !== null}
        onClose={() => setWithdrawing(null)}
        onConfirm={handleWithdraw}
        isLoading={isMutating}
        title="Withdraw application?"
        description="You can re-apply later if the shift is still open."
        confirmLabel="Withdraw"
        variant="danger"
      />
    </div>
  )
}
