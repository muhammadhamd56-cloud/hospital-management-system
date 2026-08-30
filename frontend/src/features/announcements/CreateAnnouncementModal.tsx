import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { createAnnouncement } from '@/features/announcements/api'
import { ApiError } from '@/lib/apiClient'
import { ANNOUNCEMENT_PRIORITY_LABELS, type Announcement } from '@/types/staffPortal'

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(150),
  description: z.string().min(1, 'Description is required').max(2000),
  priority: z.enum(['normal', 'important', 'urgent']),
})

type FormValues = z.infer<typeof schema>

const PRIORITY_OPTIONS = (['normal', 'important', 'urgent'] as const).map((value) => ({
  label: ANNOUNCEMENT_PRIORITY_LABELS[value],
  value,
}))

export function CreateAnnouncementModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: (announcement: Announcement) => void
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { priority: 'normal' } })

  useEffect(() => {
    if (isOpen) reset({ title: '', description: '', priority: 'normal' })
  }, [isOpen, reset])

  async function onSubmit(values: FormValues) {
    try {
      const result = await createAnnouncement(values)
      onCreated(result.announcement)
      toast.success('Announcement published')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to publish announcement')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New announcement" description="Published announcements notify every active staff member.">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input label="Title" error={errors.title?.message} {...register('title')} />
        <Textarea label="Description" error={errors.description?.message} {...register('description')} />
        <Select label="Priority" {...register('priority')} options={PRIORITY_OPTIONS} />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Publish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
