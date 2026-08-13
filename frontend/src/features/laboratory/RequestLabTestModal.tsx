import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { MOCK_PATIENTS } from '@/features/patients/mockPatients'
import { MOCK_DOCTORS } from '@/features/doctors/mockDoctors'
import { LAB_TEST_CATEGORIES } from '@/types/labTest'
import type { LabTest } from '@/types/labTest'

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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LabTestFormValues>({
    resolver: zodResolver(labTestSchema),
    defaultValues: { category: LAB_TEST_CATEGORIES[0] },
  })

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: LabTestFormValues) {
    const patient = MOCK_PATIENTS.find((p) => p.id === values.patientId)
    const doctor = MOCK_DOCTORS.find((d) => d.id === values.doctorId)
    if (!patient || !doctor) return

    await new Promise((resolve) => setTimeout(resolve, 400))
    onRequest({
      id: `L-${crypto.randomUUID().slice(0, 8)}`,
      patientId: patient.id,
      patientName: patient.name,
      doctorName: doctor.name,
      testName: values.testName,
      category: values.category,
      requestedDate: new Date().toISOString().slice(0, 10),
      status: 'pending',
    })
    toast.success(`${values.testName} requested for ${patient.name}`)
    handleClose()
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
            ...MOCK_PATIENTS.map((patient) => ({ label: patient.name, value: patient.id })),
          ]}
        />
        <Select
          label="Referring doctor"
          error={errors.doctorId?.message}
          {...register('doctorId')}
          options={[
            { label: 'Select a doctor', value: '' },
            ...MOCK_DOCTORS.map((doctor) => ({ label: doctor.name, value: doctor.id })),
          ]}
        />
        <div className="grid grid-cols-2 gap-4">
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
