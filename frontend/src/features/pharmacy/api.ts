import { api } from '@/lib/apiClient'
import type { Medicine, MedicineCategory } from '@/types/medicine'

export interface MedicineListResponse {
  medicines: Medicine[]
}

export interface CreateMedicineInput {
  name: string
  category: MedicineCategory
  stock: number
  unit: string
  price: number
  expiryDate: string
}

export function listMedicines(): Promise<MedicineListResponse> {
  return api.get('/pharmacy/medicines')
}

export function createMedicine(input: CreateMedicineInput): Promise<{ medicine: Medicine }> {
  return api.post('/pharmacy/medicines', input)
}

/** Positive delta restocks, negative dispenses. */
export function adjustMedicineStock(id: string, delta: number): Promise<{ medicine: Medicine }> {
  return api.patch(`/pharmacy/medicines/${id}/stock`, { delta })
}
