import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listMyMedicalRecords } from '@/features/patientMedicalRecords/api'
import { ApiError } from '@/lib/apiClient'
import type { MedicalRecord } from '@/types/medicalRecord'

export function useMyMedicalRecords() {
  const [records, setRecords] = useState<MedicalRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    listMyMedicalRecords()
      .then((res) => setRecords(res.records))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load your medical records'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [])

  return { records, isLoading }
}
