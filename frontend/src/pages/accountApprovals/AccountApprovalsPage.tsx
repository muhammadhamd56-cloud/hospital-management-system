import { useEffect, useState } from 'react'
import { Check, ShieldCheck, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { Textarea } from '@/components/ui/Textarea'
import { listAccountRequests, reviewAccountRequest, type AccountRequest } from '@/features/accountApprovals/api'
import { ApiError } from '@/lib/apiClient'
import { cn } from '@/utils/cn'

type View = 'pending' | 'rejected'

const VIEWS: { value: View; label: string }[] = [
  { value: 'pending', label: 'Awaiting review' },
  { value: 'rejected', label: 'Rejected' },
]

/**
 * Admin review queue for self-registered doctor and staff accounts. Until
 * approved, those accounts can sign in but reach nothing beyond their own
 * profile (enforced by the API), because the role grants access to patient data.
 */
export function AccountApprovalsPage() {
  const [view, setView] = useState<View>('pending')
  const [requests, setRequests] = useState<AccountRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<AccountRequest | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  useEffect(() => {
    let cancelled = false
    listAccountRequests(view)
      .then((res) => {
        if (cancelled) return
        setRequests(res.requests)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(error instanceof ApiError ? error.message : 'Failed to load account requests')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [view])

  function switchView(next: View) {
    if (next === view) return
    setIsLoading(true)
    setRequests([])
    setView(next)
  }

  async function review(request: AccountRequest, decision: 'approve' | 'reject', note?: string) {
    setBusyId(request.id)
    try {
      await reviewAccountRequest(request.id, { decision, note })
      // Either decision moves the request out of the list being shown.
      setRequests((current) => current.filter((r) => r.id !== request.id))
      toast.success(decision === 'approve' ? `${request.fullName} approved` : `${request.fullName}'s request rejected`)
      setRejecting(null)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update the request')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Account approvals</h1>
        <p className="text-sm text-ink-muted">
          Doctors and staff who sign themselves up can&apos;t see any patient information until you approve them.
        </p>
      </div>

      <div role="group" aria-label="Filter requests" className="flex gap-2">
        {VIEWS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={view === option.value ? 'primary' : 'secondary'}
            aria-pressed={view === option.value}
            onClick={() => switchView(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="rounded-card border border-surface-border bg-surface">
        {isLoading ? (
          <p className="px-6 py-12 text-center text-sm text-ink-muted" role="status">
            Loading requests…
          </p>
        ) : loadError ? (
          <p className="px-6 py-12 text-center text-sm text-danger-600" role="alert">
            {loadError}
          </p>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={view === 'pending' ? 'No accounts waiting for approval' : 'No rejected requests'}
            description={view === 'pending' ? 'New doctor and staff signups will appear here.' : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Requested</TableHead>
                {view === 'rejected' && <TableHead>Reason given</TableHead>}
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <p className="font-medium text-ink">{request.fullName}</p>
                    <p className="text-xs text-ink-muted">{request.email}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={request.role === 'doctor' ? 'brand' : 'info'}>
                      {request.role === 'doctor' ? 'Doctor' : 'Staff'}
                    </Badge>
                    {request.specialization && (
                      <p className="mt-1 text-xs text-ink-muted">
                        {request.specialization}
                        {request.department && request.department !== request.specialization
                          ? ` · ${request.department}`
                          : ''}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>{new Date(request.requestedAt).toLocaleDateString()}</TableCell>
                  {view === 'rejected' && <TableCell className="max-w-xs">{request.note ?? '—'}</TableCell>}
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => review(request, 'approve')}
                        isLoading={busyId === request.id}
                        disabled={busyId !== null}
                        aria-label={`Approve ${request.fullName}`}
                      >
                        <Check className="size-4" aria-hidden="true" /> Approve
                      </Button>
                      {view === 'pending' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busyId !== null}
                          onClick={() => {
                            setRejectNote('')
                            setRejecting(request)
                          }}
                          aria-label={`Reject ${request.fullName}`}
                        >
                          <X className="size-4" aria-hidden="true" /> Reject
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Modal
        isOpen={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Reject account request"
        description={
          rejecting ? `${rejecting.fullName} will be told the request wasn't approved, along with your reason.` : undefined
        }
      >
        {rejecting && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void review(rejecting, 'reject', rejectNote.trim() || undefined)
            }}
          >
            <Textarea
              label="Reason (optional, shown to the applicant)"
              value={rejectNote}
              maxLength={500}
              onChange={(event) => setRejectNote(event.target.value)}
              placeholder="e.g. We couldn't verify your medical licence"
            />
            <div className={cn('flex justify-end gap-2')}>
              <Button type="button" variant="secondary" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" isLoading={busyId === rejecting.id}>
                Reject request
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
