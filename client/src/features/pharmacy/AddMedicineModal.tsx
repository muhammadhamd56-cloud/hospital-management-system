import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { MEDICINE_CATEGORIES } from '@/types/medicine'
import type { Medicine } from '@/types/medicine'

const medicineSchema = z.object({
  name: z.string().min(2, 'Enter the medicine name'),
  category: z.enum(MEDICINE_CATEGORIES),
  stock: z.coerce.number().int().min(0, 'Stock must be positive'),
  unit: z.string().min(1, 'Enter a unit (e.g. tablets)'),
  price: z.coerce.number().min(0, 'Price must be positive'),
  expiryDate: z.string().min(1, 'Select an expiry date'),
})

type MedicineFormInput = z.input<typeof medicineSchema>

interface AddMedicineModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (medicine: Medicine) => void
}

export function AddMedicineModal({ isOpen, onClose, onAdd }: AddMedicineModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MedicineFormInput>({
    resolver: zodResolver(medicineSchema),
    defaultValues: { category: MEDICINE_CATEGORIES[0] },
  })

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: MedicineFormInput) {
    const parsed = medicineSchema.parse(values)
    await new Promise((resolve) => setTimeout(resolve, 400))
    onAdd({ id: `M-${crypto.randomUUID().slice(0, 8)}`, ...parsed })
    toast.success(`${parsed.name} was added to inventory`)
    handleClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Medicine"
      description="Add a new medicine to the pharmacy inventory."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name" error={errors.name?.message} {...register('name')} />
          <Select
            label="Category"
            options={MEDICINE_CATEGORIES.map((category) => ({
              label: category,
              value: category,
            }))}
            {...register('category')}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Stock"
            type="number"
            error={errors.stock?.message}
            {...register('stock')}
          />
          <Input label="Unit" error={errors.unit?.message} {...register('unit')} />
          <Input
            label="Price (USD)"
            type="number"
            step="0.01"
            error={errors.price?.message}
            {...register('price')}
          />
        </div>
        <Input
          label="Expiry date"
          type="date"
          error={errors.expiryDate?.message}
          {...register('expiryDate')}
        />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Add medicine
          </Button>
        </div>
      </form>
    </Modal>
  )
}
