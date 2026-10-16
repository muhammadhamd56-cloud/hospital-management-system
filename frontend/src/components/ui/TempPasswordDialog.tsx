import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export interface CreatedAccount {
  fullName: string
  /** Plaintext, returned by the API exactly once -- shown here, never stored. */
  tempPassword: string
}

interface TempPasswordDialogProps {
  account: CreatedAccount | null
  onClose: () => void
}

/**
 * Shown right after an admin creates a patient, doctor or staff account:
 * the temporary password exists only in that one API response, so every
 * place that creates an account must show it here or it's lost for good.
 */
export function TempPasswordDialog({ account, onClose }: TempPasswordDialogProps) {
  return (
    <Modal
      isOpen={account !== null}
      onClose={onClose}
      title="Account created"
      description={
        account ? `Relay this temporary password to ${account.fullName} — it won't be shown again.` : undefined
      }
    >
      {/* Keyed so the "Copied" state resets for each new account. */}
      {account && <TempPasswordBody key={account.tempPassword} account={account} onClose={onClose} />}
    </Modal>
  )
}

function TempPasswordBody({ account, onClose }: { account: CreatedAccount; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(account.tempPassword)
      setCopied(true)
      toast.success('Copied to clipboard')
    } catch {
      // Clipboard access can be denied (permissions, non-HTTPS) -- the password is still on screen.
      toast.error("Couldn't copy automatically — select the password and copy it manually")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-alt px-4 py-3">
        <code className="break-all text-sm font-medium text-ink select-all">{account.tempPassword}</code>
        <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="size-4" aria-hidden="true" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" /> Copy
            </>
          )}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}
