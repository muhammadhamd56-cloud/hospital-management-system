import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, ShieldCheck, XCircle } from 'lucide-react'
import { Badge, Button, ConfirmDialog } from '@/components/ui'
import type { CopilotProposal, ProposalStatus } from '@/features/adminCopilot/api'

const STATUS_BADGE: Record<ProposalStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  pending: { label: 'Awaiting your approval', variant: 'warning' },
  executing: { label: 'Executing…', variant: 'info' },
  executed: { label: 'Done', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
  rejected: { label: 'Rejected', variant: 'neutral' },
  expired: { label: 'Expired', variant: 'neutral' },
}

function actionTitle(actionType: string): string {
  const [domain, action = ''] = actionType.split('.')
  const words = action.replace(/([A-Z])/g, ' $1').toLowerCase()
  return `${domain.charAt(0).toUpperCase()}${domain.slice(1)}: ${words}`
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

interface ProposalCardProps {
  proposal: CopilotProposal
  onDecide: (proposal: CopilotProposal, approve: boolean) => Promise<unknown>
}

/**
 * The human-approval step. Shows exactly the parameters that will be sent to
 * the existing service; approving quotes the proposal's hash, so the backend
 * executes only what was shown here.
 */
export function ProposalCard({ proposal, onDecide }: ProposalCardProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (proposal.status !== 'pending') return
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [proposal.status])

  const isExpired = proposal.status === 'pending' && new Date(proposal.expiresAt).getTime() < now
  const status: ProposalStatus = isExpired ? 'expired' : proposal.status
  const badge = STATUS_BADGE[status]

  async function decide(approve: boolean) {
    setBusy(approve ? 'approve' : 'reject')
    await onDecide(proposal, approve)
    setBusy(null)
    setConfirming(false)
  }

  return (
    <div className="rounded-xl border border-warning-500/40 bg-surface p-3 shadow-sm" data-testid="copilot-proposal">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-warning-600" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink">{actionTitle(proposal.actionType)}</p>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <p className="mt-2 text-sm text-ink">{proposal.summary}</p>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-surface-alt p-2 text-xs">
        {Object.entries(proposal.params).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="font-medium text-ink-muted">{key}</dt>
            <dd className="break-all text-ink">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>

      {status === 'pending' && (
        <>
          <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
            <Clock className="size-3" aria-hidden="true" />
            Nothing has changed yet. Expires {new Date(proposal.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => setConfirming(true)} disabled={busy !== null}>
              Review &amp; approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => void decide(false)} isLoading={busy === 'reject'} disabled={busy !== null}>
              Reject
            </Button>
          </div>
        </>
      )}

      {status === 'executed' && (
        <p className="mt-2 flex items-center gap-1 text-xs text-success-600">
          <CheckCircle2 className="size-3" aria-hidden="true" />
          Confirmed by the server{proposal.executedAt ? ` at ${new Date(proposal.executedAt).toLocaleTimeString()}` : ''}.
        </p>
      )}
      {status === 'failed' && (
        <p className="mt-2 flex items-center gap-1 text-xs text-danger-600">
          <XCircle className="size-3" aria-hidden="true" />
          {proposal.errorMessage ?? 'The action failed.'}
        </p>
      )}

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void decide(true)}
        title="Approve this action?"
        description={`${proposal.summary} This runs through the normal hospital system checks and is recorded in the audit log.`}
        confirmLabel="Approve and run"
        isLoading={busy === 'approve'}
      />
    </div>
  )
}
