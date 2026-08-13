import { useEffect, useState } from 'react'
import { CircleDot } from 'lucide-react'
import toast from 'react-hot-toast'
import { getDoctorProfile, setDoctorAvailability } from '@/features/doctorDashboard/api'
import { ApiError } from '@/lib/apiClient'
import { cn } from '@/utils/cn'

interface AvailabilityToggleProps {
  labelClass: string
}

export function AvailabilityToggle({ labelClass }: AvailabilityToggleProps) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    getDoctorProfile()
      .then((res) => setIsAvailable(res.profile?.isAvailable ?? null))
      .catch(() => setIsAvailable(null))
  }, [])

  if (isAvailable === null) return null

  async function toggle() {
    const next = !isAvailable
    setIsSaving(true)
    setIsAvailable(next)
    try {
      await setDoctorAvailability(next)
      toast.success(next ? "You're now visible as available" : 'You are now marked unavailable')
    } catch (error) {
      setIsAvailable(!next)
      const message = error instanceof ApiError ? error.message : 'Failed to update availability'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isAvailable}
      disabled={isSaving}
      onClick={toggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink disabled:opacity-60"
    >
      <CircleDot
        className={cn('size-5 shrink-0', isAvailable ? 'text-success-500' : 'text-ink-muted/50')}
        aria-hidden="true"
      />
      <span className={cn(labelClass, 'flex-1 text-left')}>
        {isAvailable ? 'Available' : 'Unavailable'}
      </span>
      <span
        className={cn(
          labelClass,
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          isAvailable ? 'bg-brand-600' : 'bg-surface-border',
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform',
            isAvailable ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
