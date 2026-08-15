import { useState } from 'react'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/features/auth/useAuth'
import { AccountInfoForm } from '@/features/auth/AccountInfoForm'
import { SetPasswordCard } from '@/features/auth/SetPasswordCard'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'

export function PatientSettingsPage() {
  const { deleteAccount } = useAuth()
  const navigate = useNavigate()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      await deleteAccount()
      toast.success('Your account has been deleted')
      navigate(ROUTES.login, { replace: true })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to delete your account'
      toast.error(message)
      setIsDeleting(false)
      setIsConfirmOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-ink-muted">Manage your account.</p>
      </div>

      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Update your name and phone number.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountInfoForm />
        </CardContent>
      </Card>

      <div className="animate-fade-in" style={{ animationDelay: '60ms' }}>
        <SetPasswordCard />
      </div>

      <Card className="animate-fade-in border-danger-500/40" style={{ animationDelay: '120ms' }}>
        <CardHeader>
          <CardTitle className="text-danger-600">Danger Zone</CardTitle>
          <CardDescription>Permanently delete your account and all associated data.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="danger" onClick={() => setIsConfirmOpen(true)}>
            Delete Account
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        title="Delete your account?"
        description="This permanently deletes your account, appointments, and chat history. This action cannot be undone."
        confirmLabel="Delete account"
        variant="danger"
      />
    </div>
  )
}
