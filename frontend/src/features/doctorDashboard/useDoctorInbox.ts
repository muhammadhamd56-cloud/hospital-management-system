import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listInboxPatients } from '@/features/doctorDashboard/api'
import { ApiError } from '@/lib/apiClient'
import type { DoctorInboxPatient } from '@/types/doctorChatInbox'

export function useDoctorInbox() {
  const [patients, setPatients] = useState<DoctorInboxPatient[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    listInboxPatients()
      .then((res) => setPatients(res.patients))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load your conversations'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [])

  return { patients, isLoading }
}
