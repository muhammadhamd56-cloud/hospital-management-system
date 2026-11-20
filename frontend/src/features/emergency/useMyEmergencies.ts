import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listMyEmergencies } from '@/features/emergency/api'
import { ApiError } from '@/lib/apiClient'
import { ACTIVE_EMERGENCY_STATUSES, type EmergencyCaseSummary } from '@/types/emergency'

export function useMyEmergencies() {
  const [emergencyCases, setEmergencyCases] = useState<EmergencyCaseSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Only sets state from the async callbacks, so the mount effect can call
  // it directly (isLoading already starts as true).
  function load() {
    listMyEmergencies()
      .then((res) => setEmergencyCases(res.emergencyCases))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load your emergency requests'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }

  function refresh() {
    setIsLoading(true)
    load()
  }

  useEffect(() => {
    load()
  }, [])

  const activeCase = emergencyCases.find((c) => ACTIVE_EMERGENCY_STATUSES.includes(c.status)) ?? null

  return { emergencyCases, activeCase, isLoading, refresh }
}
