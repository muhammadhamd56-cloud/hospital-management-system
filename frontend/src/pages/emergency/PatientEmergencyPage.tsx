import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, ArrowRight, Siren } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { CreateEmergencyModal } from '@/features/emergency/CreateEmergencyModal'
import { EmergencyStatusBadge } from '@/features/emergency/EmergencyStatusBadge'
import { useMyEmergencies } from '@/features/emergency/useMyEmergencies'
import { buildEmergencyCaseUrl } from '@/constants/routes'
import { EMERGENCY_TYPE_LABELS } from '@/types/emergency'

export function PatientEmergencyPage() {
  const { emergencyCases, activeCase, isLoading } = useMyEmergencies()
  const [isConfirmOpen, setConfirmOpen] = useState(false)
  const navigate = useNavigate()

  const history = emergencyCases.filter((c) => c.id !== activeCase?.id)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Emergency</h1>
        <p className="text-sm text-ink-muted">Hospital emergency request -- not a call to an ambulance.</p>
      </div>

      {activeCase ? (
        <Card className="border-danger-500/40 bg-danger-50 dark:bg-danger-500/10">
          <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-100 text-danger-600 dark:bg-danger-500/20 dark:text-danger-300">
                <Siren className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-ink">You have an active emergency request</p>
                <p className="text-sm text-ink-muted">
                  {EMERGENCY_TYPE_LABELS[activeCase.emergencyType]} ·{' '}
                  <EmergencyStatusBadge status={activeCase.status} />
                </p>
              </div>
            </div>
            <Button onClick={() => navigate(buildEmergencyCaseUrl(activeCase.id))} className="shrink-0">
              View request
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300">
              <AlertTriangle className="size-7" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium text-ink">Need urgent help?</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
                Submit a hospital emergency request and authorized emergency staff will be notified immediately.
              </p>
            </div>
            <Button variant="danger" size="lg" onClick={() => setConfirmOpen(true)}>
              <Siren className="size-4" aria-hidden="true" />
              Emergency
            </Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">Emergency history</h2>
        {!isLoading && history.length === 0 ? (
          <Card>
            <EmptyState
              icon={Siren}
              title="No past emergency requests"
              description="Requests you create will show up here once resolved or cancelled."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((emergencyCase) => (
              <Card
                key={emergencyCase.id}
                className="cursor-pointer transition-colors hover:bg-surface-alt"
                onClick={() => navigate(buildEmergencyCaseUrl(emergencyCase.id))}
              >
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="font-medium text-ink">{EMERGENCY_TYPE_LABELS[emergencyCase.emergencyType]}</p>
                    <p className="text-xs text-ink-muted">{new Date(emergencyCase.createdAt).toLocaleString()}</p>
                  </div>
                  <EmergencyStatusBadge status={emergencyCase.status} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateEmergencyModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} />
    </div>
  )
}
