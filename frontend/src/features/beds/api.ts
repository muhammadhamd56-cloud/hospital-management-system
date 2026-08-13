import { api } from '@/lib/apiClient'
import type { Bed } from '@/types/bed'

export interface BedListResponse {
  beds: Bed[]
  totalCount: number
  availableCount: number
}

export function listBeds(): Promise<BedListResponse> {
  return api.get('/beds')
}

export function assignBed(bedId: string, patientId: string): Promise<{ bed: Bed }> {
  return api.patch(`/beds/${bedId}/assign`, { patientId })
}

export function releaseBed(bedId: string): Promise<{ bed: Bed }> {
  return api.patch(`/beds/${bedId}/release`)
}
