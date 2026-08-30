import { api } from '@/lib/apiClient'

export function setupMfa(): Promise<{ secret: string; qrCodeDataUrl: string }> {
  return api.post('/users/me/mfa/setup')
}

export function confirmMfa(code: string): Promise<{ backupCodes: string[] }> {
  return api.post('/users/me/mfa/confirm', { code })
}

export function disableMfa(password: string): Promise<void> {
  return api.post('/users/me/mfa/disable', { password })
}
