import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createTask, updateTask } from '@/features/staffScheduling/api'
import { isoToLocalDatetimeInput } from '@/features/staffScheduling/datetime'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'
import { STAFF_TYPE_LABELS, type Staff } from '@/types/staffScheduling'
import { TASK_PRIORITY_OPTIONS, type Task } from '@/types/staffPortal'

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(150),
  description: z.string().max(1000).optional(),
  dueAt: z.string().min(1, 'Due date/time is required'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  department: z.string().optional(),
  assignedToId: z.string().min(1, 'Assignee is required'),
})

type FormValues = z.infer<typeof schema>

interface TaskFormModalProps {
  isOpen: boolean
  onClose: () => void
  staff: Staff[]
  task?: Task | null
  onSaved: (task: Task) => void
}

export function TaskFormModal({ isOpen, onClose, staff, task, onSaved }: TaskFormModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const activeStaff = staff.filter((member) => member.isActive)

  useEffect(() => {
    if (!isOpen) return

    if (task) {
      reset({
        title: task.title,
        description: task.description ?? '',
        dueAt: isoToLocalDatetimeInput(task.dueAt),
        priority: task.priority,
        department: task.department ?? '',
        assignedToId: task.assignedTo.id,
      })
    } else {
      const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      reset({
        title: '',
        description: '',
        dueAt: isoToLocalDatetimeInput(inOneDay),
        priority: 'medium',
        department: '',
        assignedToId: activeStaff[0]?.id ?? '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, task])

  async function onSubmit(values: FormValues) {
    const dueAt = new Date(values.dueAt).toISOString()

    try {
      const result = task
        ? await updateTask(task.id, {
            title: values.title,
            description: values.description || undefined,
            dueAt,
            priority: values.priority,
            department: values.department || undefined,
            assignedToId: values.assignedToId,
          })
        : await createTask({
            title: values.title,
            description: values.description || undefined,
            dueAt,
            priority: values.priority,
            department: values.department || undefined,
            assignedToId: values.assignedToId,
          })
      onSaved(result.task)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to save task')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={task ? 'Edit task' : 'Assign task'}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select
          label="Assign to"
          error={errors.assignedToId?.message}
          {...register('assignedToId')}
          options={
            activeStaff.length > 0
              ? activeStaff.map((member) => ({
                  label: `${member.fullName} (${STAFF_TYPE_LABELS[member.staffType]})`,
                  value: member.id,
                }))
              : [{ label: 'No active staff on roster', value: '' }]
          }
        />
        <Input label="Title" error={errors.title?.message} {...register('title')} />
        <Textarea label="Description (optional)" error={errors.description?.message} {...register('description')} />
        <Input label="Due date & time" type="datetime-local" error={errors.dueAt?.message} {...register('dueAt')} />
        <Select label="Priority" {...register('priority')} options={TASK_PRIORITY_OPTIONS} />
        <Select
          label="Department (optional)"
          {...register('department')}
          options={[{ label: 'No department', value: '' }, ...DEPARTMENTS.map((dept) => ({ label: dept, value: dept }))]}
        />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={activeStaff.length === 0}>
            {task ? 'Save changes' : 'Assign task'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
