import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { adjustMedicineStock } from '@/features/pharmacy/api'
import { ApiError } from '@/lib/apiClient'
import type { Medicine } from '@/types/medicine'

const schema = z.object({
  direction: z.enum(['restock', 'dispense']),
  amount: z.coerce.number().int().min(1, 'Enter an amount of at least 1'),
})

type FormInput = z.input<typeof schema>

interface AdjustStockModalProps {
  medicine: Medicine | null
  onClose: () => void
  onAdjusted: (medicine: Medicine) => void
}

export function AdjustStockModal({ medicine, onClose, onAdjusted }: AdjustStockModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema), defaultValues: { direction: 'restock', amount: 1 } })

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: FormInput) {
    if (!medicine) return

    const parsed = schema.parse(values)
    const delta = parsed.direction === 'restock' ? parsed.amount : -parsed.amount

    try {
      const res = await adjustMedicineStock(medicine.id, delta)
      onAdjusted(res.medicine)
      toast.success(`${medicine.name} ${values.direction === 'restock' ? 'restocked' : 'dispensed'}`)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to adjust stock'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={medicine !== null}
      onClose={handleClose}
      title="Adjust Stock"
      description={medicine ? `Current stock: ${medicine.stock} ${medicine.unit}` : undefined}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select
          label="Action"
          error={errors.direction?.message}
          {...register('direction')}
          options={[
            { label: 'Restock (add)', value: 'restock' },
            { label: 'Dispense (remove)', value: 'dispense' },
          ]}
        />
        <Input
          label="Amount"
          type="number"
          min={1}
          error={errors.amount?.message}
          {...register('amount')}
        />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
