import { useEffect, useState } from 'react'
import { Percent, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/currency'
import { ApiError } from '@/lib/apiClient'
import { getPlatformSettings, updatePlatformSettings } from '@/features/billing/api'

/** Admin-only control for the flat markup folded into every auto-generated
 *  consultation invoice on top of a doctor's own fee (e.g. doctor charges
 *  $200, patient is billed $200 + this margin). The doctor's own
 *  consultationFee is never changed by this -- see BillingService.createConsultationInvoice. */
export function ConsultationMarginCard() {
  const [margin, setMargin] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    getPlatformSettings()
      .then((settings) => setMargin(settings.consultationMargin))
      .catch(() => setMargin(0))
  }, [])

  function startEditing() {
    setDraft(String(margin ?? 0))
    setIsEditing(true)
  }

  async function handleSave() {
    const parsed = Number(draft)

    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Enter a valid, non-negative amount')
      return
    }

    setIsSaving(true)
    try {
      const settings = await updatePlatformSettings({ consultationMargin: parsed })
      setMargin(settings.consultationMargin)
      setIsEditing(false)
      toast.success('Consultation margin updated')
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update margin'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-brand-50 p-2 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <Percent className="size-4" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-ink">Consultation margin</p>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Added on top of the doctor's fee in every booking's invoice (e.g. a $200 fee bills the patient $
            {(200 + (margin ?? 0)).toFixed(2)}). The doctor's own fee is unaffected.
          </p>

          {isEditing ? (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-32">
                <Input
                  label="Margin (USD)"
                  hideLabel
                  type="number"
                  step="0.01"
                  min={0}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  autoFocus
                />
              </div>
              <Button type="button" size="sm" onClick={handleSave} isLoading={isSaving}>
                Save
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-2xl font-semibold text-ink">
              {margin === null ? 'Loading…' : formatCurrency(margin)}
            </p>
          )}
        </div>

        {!isEditing && (
          <Button type="button" size="sm" variant="secondary" onClick={startEditing} disabled={margin === null}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Button>
        )}
      </div>
    </Card>
  )
}
