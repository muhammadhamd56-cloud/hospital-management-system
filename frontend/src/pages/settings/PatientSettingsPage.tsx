import { useState } from 'react'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import { ROLE_LABELS } from '@/types/role'

export function PatientSettingsPage() {
  const { user, deleteAccount } = useAuth()
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
          <CardDescription>Synced from your Google account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar name={user?.fullName ?? ''} src={user?.picture ?? undefined} size="lg" />
            <dl className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-muted">Full name</dt>
                <dd className="text-sm font-medium text-ink">{user?.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Email</dt>
                <dd className="text-sm font-medium text-ink">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Account type</dt>
                <dd className="text-sm font-medium text-ink">
                  {user ? ROLE_LABELS[user.role] : ''}
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card className="animate-fade-in border-danger-500/40" style={{ animationDelay: '60ms' }}>
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
