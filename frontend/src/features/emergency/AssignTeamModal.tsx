import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { assignEmergency, listAssignableNurses } from '@/features/emergency/api'
import { listDoctors } from '@/features/patientDashboard/api'
import { ApiError } from '@/lib/apiClient'
import type { AssignableNurse, EmergencyCaseSummary } from '@/types/emergency'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

export interface AssignTeamModalProps {
  isOpen: boolean
  caseId: string
  onClose: () => void
  onAssigned: (emergencyCase: EmergencyCaseSummary) => void
}

export function AssignTeamModal({ isOpen, caseId, onClose, onAssigned }: AssignTeamModalProps) {
  const [doctors, setDoctors] = useState<DirectoryDoctor[]>([])
  const [nurses, setNurses] = useState<AssignableNurse[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [teamName, setTeamName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setDoctorId('')
    setStaffId('')
    setTeamName('')
    listDoctors({ limit: 50 })
      .then((res) => setDoctors(res.doctors))
      .catch(() => setDoctors([]))
    listAssignableNurses()
      .then((res) => setNurses(res.nurses))
      .catch(() => setNurses([]))
  }, [isOpen])

  async function handleSubmit() {
    if (!doctorId && !staffId && !teamName.trim()) {
      toast.error('Assign at least a doctor, a nurse, or a team name')
      return
    }

    setIsSubmitting(true)
    try {
      const { emergencyCase } = await assignEmergency(caseId, {
        doctorId: doctorId || undefined,
        staffId: staffId || undefined,
        teamName: teamName.trim() || undefined,
      })
      onAssigned(emergencyCase)
      toast.success('Emergency team assigned')
      onClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to assign team'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign Team" description="Assign a doctor, nurse, or team to this case.">
      <div className="flex flex-col gap-4">
        <Select
          label="Doctor"
          value={doctorId}
          onChange={(event) => setDoctorId(event.target.value)}
          options={[{ label: 'None', value: '' }, ...doctors.map((doctor) => ({ label: doctor.fullName, value: doctor.id }))]}
        />
        <Select
          label="Nurse"
          value={staffId}
          onChange={(event) => setStaffId(event.target.value)}
          options={[{ label: 'None', value: '' }, ...nurses.map((nurse) => ({ label: nurse.fullName, value: nurse.id }))]}
        />
        <Input label="Team name" placeholder="e.g. Emergency Team A" value={teamName} onChange={(event) => setTeamName(event.target.value)} />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" isLoading={isSubmitting} onClick={handleSubmit}>
            Assign
          </Button>
        </div>
      </div>
    </Modal>
  )
}
