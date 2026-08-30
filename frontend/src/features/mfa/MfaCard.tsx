import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Check, Copy, ShieldCheck } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/features/auth/useAuth'
import { setupMfa, confirmMfa, disableMfa } from '@/features/mfa/api'
import { ApiError } from '@/lib/apiClient'

const confirmSchema = z.object({
  code: z.string().length(6, 'Enter the 6-digit code from your authenticator app'),
})
type ConfirmFormValues = z.infer<typeof confirmSchema>

const disableSchema = z.object({
  password: z.string().min(1, 'Your current password is required'),
})
type DisableFormValues = z.infer<typeof disableSchema>

type Step = 'idle' | 'setup' | 'disable'

export function MfaCard() {
  const { user, refresh } = useAuth()
  const [step, setStep] = useState<Step>('idle')
  const [qrData, setQrData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)
  const [isStarting, setIsStarting] = useState(false)

  const {
    register: registerConfirm,
    handleSubmit: handleConfirmSubmit,
    reset: resetConfirm,
    formState: { errors: confirmErrors, isSubmitting: isConfirming },
  } = useForm<ConfirmFormValues>({ resolver: zodResolver(confirmSchema) })

  const {
    register: registerDisable,
    handleSubmit: handleDisableSubmit,
    reset: resetDisable,
    formState: { errors: disableErrors, isSubmitting: isDisabling },
  } = useForm<DisableFormValues>({ resolver: zodResolver(disableSchema) })

  async function handleStart() {
    setIsStarting(true)
    try {
      const res = await setupMfa()
      setQrData(res)
      setStep('setup')
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to start setup'
      toast.error(message)
    } finally {
      setIsStarting(false)
    }
  }

  async function onConfirm(values: ConfirmFormValues) {
    try {
      const res = await confirmMfa(values.code)
      setBackupCodes(res.backupCodes)
      await refresh()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Incorrect code'
      toast.error(message)
    }
  }

  function handleDoneWithBackupCodes() {
    setBackupCodes(null)
    setQrData(null)
    setStep('idle')
    resetConfirm()
  }

  async function handleCopyBackupCodes() {
    if (!backupCodes) return
    await navigator.clipboard.writeText(backupCodes.join('\n'))
    setCopied(true)
    toast.success('Copied to clipboard')
  }

  async function onDisable(values: DisableFormValues) {
    try {
      await disableMfa(values.password)
      toast.success('Two-factor authentication turned off')
      setStep('idle')
      resetDisable()
      await refresh()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Incorrect password'
      toast.error(message)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>
            Add an extra step to sign-in using an authenticator app (Google Authenticator, Authy, 1Password, etc).
          </CardDescription>
        </div>
        {user?.mfaEnabled && <Badge variant="success">On</Badge>}
      </CardHeader>
      <CardContent>
        {step === 'idle' && !user?.mfaEnabled && (
          <Button onClick={handleStart} isLoading={isStarting}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            Enable two-factor authentication
          </Button>
        )}

        {step === 'idle' && user?.mfaEnabled && (
          <Button variant="danger" onClick={() => setStep('disable')}>
            Turn off two-factor authentication
          </Button>
        )}

        {step === 'setup' && qrData && !backupCodes && (
          <form className="flex flex-col gap-4" onSubmit={handleConfirmSubmit(onConfirm)} noValidate>
            <p className="text-sm text-ink-muted">
              Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
            </p>
            <img
              src={qrData.qrCodeDataUrl}
              alt="Scan this QR code with your authenticator app"
              className="size-48 self-center rounded-lg border border-surface-border p-2"
            />
            <p className="self-center break-all text-center font-mono text-xs text-ink-muted">{qrData.secret}</p>
            <Input
              label="6-digit code"
              autoComplete="one-time-code"
              placeholder="123456"
              error={confirmErrors.code?.message}
              {...registerConfirm('code')}
            />
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setStep('idle')
                  setQrData(null)
                  resetConfirm()
                }}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={isConfirming}>
                Confirm
              </Button>
            </div>
          </form>
        )}

        {step === 'disable' && (
          <form className="flex flex-col gap-4" onSubmit={handleDisableSubmit(onDisable)} noValidate>
            <Input
              label="Current password"
              type="password"
              error={disableErrors.password?.message}
              {...registerDisable('password')}
            />
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setStep('idle')
                  resetDisable()
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="danger" isLoading={isDisabling}>
                Turn off
              </Button>
            </div>
          </form>
        )}
      </CardContent>

      <Modal
        isOpen={backupCodes !== null}
        onClose={handleDoneWithBackupCodes}
        title="Save your backup codes"
        description="Each code works once, if you ever lose access to your authenticator app. Store them somewhere safe — they won't be shown again."
      >
        {backupCodes && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-surface-border bg-surface-alt p-4 font-mono text-sm">
              {backupCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <div className="flex justify-between gap-3">
              <Button type="button" variant="secondary" onClick={handleCopyBackupCodes}>
                {copied ? (
                  <>
                    <Check className="size-4" aria-hidden="true" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" aria-hidden="true" /> Copy all
                  </>
                )}
              </Button>
              <Button type="button" onClick={handleDoneWithBackupCodes}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  )
}
