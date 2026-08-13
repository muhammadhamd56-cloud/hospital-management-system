import { api } from '@/lib/apiClient'

export interface SetPasswordInput {
  currentPassword?: string
  newPassword: string
}

export function setPassword(input: SetPasswordInput): Promise<void> {
  return api.patch('/users/me/password', input)
}
