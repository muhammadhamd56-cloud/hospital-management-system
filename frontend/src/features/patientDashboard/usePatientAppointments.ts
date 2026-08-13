import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listMyAppointments } from '@/features/patientDashboard/api'
import { ApiError } from '@/lib/apiClient'
import type { PatientAppointment } from '@/types/patientSession'

export function usePatientAppointments() {
  const [appointments, setAppointments] = useState<PatientAppointment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    listMyAppointments()
      .then((res) => setAppointments(res.appointments))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load your sessions'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [])

  function upsertAppointment(updated: PatientAppointment) {
    setAppointments((prev) => {
      const exists = prev.some((appointment) => appointment.id === updated.id)
      return exists
        ? prev.map((appointment) => (appointment.id === updated.id ? updated : appointment))
        : [...prev, updated]
    })
  }

  return { appointments, isLoading, upsertAppointment }
}
