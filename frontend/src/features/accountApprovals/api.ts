import { api } from '@/lib/apiClient'

export type AccountRequestStatus = 'pending' | 'approved' | 'rejected'

/** A self-registered doctor or staff account waiting for (or refused) admin approval. */
export interface AccountRequest {
  id: string
  fullName: string
  email: string
  role: 'doctor' | 'staff'
  status: AccountRequestStatus
  /** Doctor applicants only. */
  specialization: string | null
  department: string | null
  requestedAt: string
  reviewedAt: string | null
  note: string | null
}

export function listAccountRequests(status: 'pending' | 'rejected'): Promise<{ requests: AccountRequest[] }> {
  return api.get(`/account-approvals?status=${status}`)
}

export function reviewAccountRequest(
  userId: string,
  input: { decision: 'approve' | 'reject'; note?: string },
): Promise<{ request: AccountRequest }> {
  return api.patch(`/account-approvals/${userId}`, input)
}
