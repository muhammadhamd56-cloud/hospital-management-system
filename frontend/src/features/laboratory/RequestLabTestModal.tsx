import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { requestLabTest } from '@/features/laboratory/api'
import { listPatients } from '@/features/patients/api'
import { listDoctors } from '@/features/patientDashboard/api'
import { ApiError } from '@/lib/apiClient'
import { LAB_TEST_CATEGORIES } from '@/types/labTest'
import type { LabTest } from '@/types/labTest'
import type { PatientListItem } from '@/types/patientDirectory'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

const labTestSchema = z.object({
  patientId: z.string().min(1, 'Select a patient'),
  doctorId: z.string().min(1, 'Select a referring doctor'),
  testName: z.string().min(2, 'Enter a test name'),
  category: z.enum(LAB_TEST_CATEGORIES),
})

type LabTestFormValues = z.infer<typeof labTestSchema>

interface RequestLabTestModalProps {
  isOpen: boolean
  onClose: () => void
  onRequest: (labTest: LabTest) => void
}

export function RequestLabTestModal({ isOpen, onClose, onRequest }: RequestLabTestModalProps) {
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [doctors, setDoctors] = useState<DirectoryDoctor[]>([])
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LabTestFormValues>({
    resolver: zodResolver(labTestSchema),
    defaultValues: { category: LAB_TEST_CATEGORIES[0] },
  })

  useEffect(() => {
    if (!isOpen) return
    listPatients()
      .then((res) => setPatients(res.patients))
      .catch(() => setPatients([]))
    listDoctors({ limit: 50 })
      .then((res) => setDoctors(res.doctors))
      .catch(() => setDoctors([]))
  }, [isOpen])

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: LabTestFormValues) {
    try {
      const res = await requestLabTest(values)
      onRequest(res.test)
      toast.success(`${values.testName} requested`)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to request lab test'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Request Lab Test"
      description="Order a new laboratory test for a patient."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select
          label="Patient"
          error={errors.patientId?.message}
          {...register('patientId')}
          options={[
            { label: 'Select a patient', value: '' },
            ...patients.map((patient) => ({ label: patient.fullName, value: patient.id })),
          ]}
        />
        <Select
          label="Referring doctor"
          error={errors.doctorId?.message}
          {...register('doctorId')}
          options={[
            { label: 'Select a doctor', value: '' },
            ...doctors.map((doctor) => ({ label: doctor.fullName, value: doctor.id })),
          ]}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Test name"
            error={errors.testName?.message}
            {...register('testName')}
          />
          <Select
            label="Category"
            options={LAB_TEST_CATEGORIES.map((category) => ({
              label: category,
              value: category,
            }))}
            {...register('category')}
          />
        </div>
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Request test
          </Button>
        </div>
      </form>
    </Modal>
  )
}
