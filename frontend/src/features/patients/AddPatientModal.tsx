import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { createPatient, type CreatePatientResponse } from '@/features/patients/api'
import { ApiError } from '@/lib/apiClient'
import { detectDefaultCountry, phoneErrorMessage, toE164, validatePhone, type CountryCode } from '@/lib/phone'

const schema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    phone: z.object({
      country: z.custom<CountryCode>(() => true),
      nationalNumber: z.string(),
    }),
  })
  .superRefine((values, ctx) => {
    const result = validatePhone(values.phone, { required: false })
    if (!result.valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: phoneErrorMessage(values.phone, result) })
    }
  })

type FormValues = z.infer<typeof schema>

interface AddPatientModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (result: CreatePatientResponse) => void
}

export function AddPatientModal({ isOpen, onClose, onCreated }: AddPatientModalProps) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: { country: detectDefaultCountry(), nationalNumber: '' } },
  })

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: FormValues) {
    try {
      const result = await createPatient({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone.nationalNumber ? toE164(values.phone) ?? undefined : undefined,
      })
      onCreated(result)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to create account'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Patient"
      description="Creates the account with a temporary password you'll relay to them."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
          <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
        </div>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="patient@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneInput
              label="Phone number (optional)"
              value={field.value}
              onChange={field.onChange}
              error={errors.phone?.message as string | undefined}
            />
          )}
        />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Add patient
          </Button>
        </div>
      </form>
    </Modal>
  )
}
