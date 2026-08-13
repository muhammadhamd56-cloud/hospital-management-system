import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listDoctorAppointments } from '@/features/doctorDashboard/api'
import { ApiError } from '@/lib/apiClient'
import type { DoctorAppointment } from '@/types/doctorSession'

export function useDoctorAppointments() {
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    listDoctorAppointments()
      .then((res) => setAppointments(res.appointments))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load your sessions'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [])

  function upsertAppointment(updated: DoctorAppointment) {
    setAppointments((prev) => {
      const exists = prev.some((appointment) => appointment.id === updated.id)
      return exists
        ? prev.map((appointment) => (appointment.id === updated.id ? updated : appointment))
        : [...prev, updated]
    })
  }

  return { appointments, isLoading, upsertAppointment }
}
