import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { createStaffRosterEntry } from '@/features/staffScheduling/api'
import { listStaff } from '@/features/staff/api'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'
import type { Staff as StaffAccount, StaffRole } from '@/types/staff'
import {
  STAFF_TYPE_OPTIONS,
  STAFF_TYPES_REQUIRING_USER,
  type Staff,
  type StaffType,
} from '@/types/staffScheduling'

const NO_LOGIN_OPTION_VALUE = ''

const schema = z.object({
  staffType: z.enum(['doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_technician', 'other']),
  userId: z.string().optional(),
  fullName: z.string().optional(),
  email: z.string().optional(),
  department: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface AddStaffModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (staff: Staff) => void
  existingRoster: Staff[]
}

export function AddStaffModal({ isOpen, onClose, onCreated, existingRoster }: AddStaffModalProps) {
  const [accounts, setAccounts] = useState<StaffAccount[]>([])
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { staffType: 'nurse' } })
  const staffType = watch('staffType') as StaffType
  const userId = watch('userId')
  const isDoctor = staffType === 'doctor'
  const alwaysRequiresUser = STAFF_TYPES_REQUIRING_USER.includes(staffType)
  const isLinked = alwaysRequiresUser || Boolean(userId)

  useEffect(() => {
    if (!isOpen) return
    listStaff()
      .then((res) => setAccounts(res.staff))
      .catch(() => setAccounts([]))
  }, [isOpen])

  const linkedUserIds = useMemo(
    () => new Set(existingRoster.map((member) => member.userId).filter((id): id is string => Boolean(id))),
    [existingRoster],
  )

  const userOptions = useMemo(() => {
    // Doctor roster entries link to a Doctor-role account; every other
    // staff type links to the general Staff-role account pool.
    const wantedRole: StaffRole = isDoctor ? 'doctor' : 'staff'
    return accounts
      .filter((account) => account.role === wantedRole && !linkedUserIds.has(account.id))
      .map((account) => ({ label: `${account.fullName} (${account.email})`, value: account.id }))
  }, [accounts, isDoctor, linkedUserIds])

  function handleClose() {
    reset({ staffType: 'nurse' })
    onClose()
  }

  async function onSubmit(values: FormValues) {
    if (isLinked && !values.userId) {
      toast.error('Select an existing user account')
      return
    }

    if (!isLinked && !values.fullName?.trim()) {
      toast.error('Full name is required')
      return
    }

    try {
      const result = await createStaffRosterEntry({
        staffType: values.staffType,
        userId: isLinked ? values.userId : undefined,
        fullName: isLinked ? undefined : values.fullName,
        email: isLinked ? undefined : values.email || undefined,
        department: values.department || undefined,
      })
      onCreated(result.staff)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to add staff member'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add staff member"
      description="Doctors always link to an existing account. Every other staff type can either link an existing staff account or be added as a name-only roster entry."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select label="Staff type" {...register('staffType')} options={STAFF_TYPE_OPTIONS} />

        {isDoctor ? (
          userOptions.length > 0 ? (
            <Select
              label="Existing user account"
              {...register('userId')}
              options={[{ label: 'Select an account', value: '' }, ...userOptions]}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-surface-border px-3 py-2 text-sm text-ink-muted">
              No unlinked doctor accounts found. Provision one from the Staff page first.
            </p>
          )
        ) : (
          <>
            <Select
              label="Login account (optional)"
              {...register('userId')}
              options={[
                { label: 'No login -- name-only entry', value: NO_LOGIN_OPTION_VALUE },
                ...userOptions,
              ]}
            />
            {!userId && (
              <>
                <Input label="Full name" error={errors.fullName?.message} {...register('fullName')} />
                <Input label="Email (optional)" type="email" {...register('email')} />
              </>
            )}
          </>
        )}

        <Select
          label="Department (optional)"
          {...register('department')}
          options={[{ label: 'No department', value: '' }, ...DEPARTMENTS.map((dept) => ({ label: dept, value: dept }))]}
        />

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={isDoctor && userOptions.length === 0}>
            Add staff member
          </Button>
        </div>
      </form>
    </Modal>
  )
}
