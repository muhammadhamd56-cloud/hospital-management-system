export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock'

export const MEDICINE_CATEGORIES = [
  'Analgesic',
  'Antibiotic',
  'Antiviral',
  'Cardiovascular',
  'Gastrointestinal',
  'Respiratory',
  'Vitamins & Supplements',
] as const

export type MedicineCategory = (typeof MEDICINE_CATEGORIES)[number]

export interface Medicine {
  id: string
  name: string
  category: MedicineCategory
  stock: number
  unit: string
  price: number
  expiryDate: string
}

export function getStockStatus(stock: number): StockStatus {
  if (stock === 0) return 'out-of-stock'
  if (stock <= 20) return 'low-stock'
  return 'in-stock'
}
