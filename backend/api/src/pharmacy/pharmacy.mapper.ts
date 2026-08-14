import { MedicineCategory } from '@prisma/client';
import type { Medicine } from '@prisma/client';

export type ClientMedicineCategory =
  | 'Analgesic'
  | 'Antibiotic'
  | 'Antiviral'
  | 'Cardiovascular'
  | 'Gastrointestinal'
  | 'Respiratory'
  | 'Vitamins & Supplements';

const CATEGORY_TO_PRISMA: Record<ClientMedicineCategory, MedicineCategory> = {
  Analgesic: MedicineCategory.ANALGESIC,
  Antibiotic: MedicineCategory.ANTIBIOTIC,
  Antiviral: MedicineCategory.ANTIVIRAL,
  Cardiovascular: MedicineCategory.CARDIOVASCULAR,
  Gastrointestinal: MedicineCategory.GASTROINTESTINAL,
  Respiratory: MedicineCategory.RESPIRATORY,
  'Vitamins & Supplements': MedicineCategory.VITAMINS_SUPPLEMENTS,
};

const CATEGORY_TO_CLIENT: Record<MedicineCategory, ClientMedicineCategory> = {
  [MedicineCategory.ANALGESIC]: 'Analgesic',
  [MedicineCategory.ANTIBIOTIC]: 'Antibiotic',
  [MedicineCategory.ANTIVIRAL]: 'Antiviral',
  [MedicineCategory.CARDIOVASCULAR]: 'Cardiovascular',
  [MedicineCategory.GASTROINTESTINAL]: 'Gastrointestinal',
  [MedicineCategory.RESPIRATORY]: 'Respiratory',
  [MedicineCategory.VITAMINS_SUPPLEMENTS]: 'Vitamins & Supplements',
};

export function toPrismaMedicineCategory(category: ClientMedicineCategory): MedicineCategory {
  return CATEGORY_TO_PRISMA[category];
}

export function toClientMedicineCategory(category: MedicineCategory): ClientMedicineCategory {
  return CATEGORY_TO_CLIENT[category];
}

export interface MedicineResponse {
  id: string;
  name: string;
  category: ClientMedicineCategory;
  stock: number;
  unit: string;
  price: number;
  expiryDate: string;
}

export function toMedicineResponse(medicine: Medicine): MedicineResponse {
  return {
    id: medicine.id,
    name: medicine.name,
    category: toClientMedicineCategory(medicine.category),
    stock: medicine.stock,
    unit: medicine.unit,
    price: medicine.price,
    expiryDate: medicine.expiryDate.toISOString(),
  };
}
