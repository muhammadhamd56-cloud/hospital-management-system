import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { AccountInfoForm } from '@/features/auth/AccountInfoForm'
import { SetPasswordCard } from '@/features/auth/SetPasswordCard'
import { STAFF_TYPE_LABELS } from '@/types/staffScheduling'
import { getMyProfile } from '@/features/staffPortal/api'
import type { StaffPortalProfile } from '@/types/staffPortal'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export function StaffSettingsPage() {
  const [profile, setProfile] = useState<StaffPortalProfile | null>(null)

  useEffect(() => {
    getMyProfile()
      .then((res) => setProfile(res.profile))
      .catch(() => {
        // Falls back to just the account-info card below.
      })
  }, [])

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

      <Card className="animate-fade-in" style={{ animationDelay: '120ms' }}>
        <CardHeader>
          <CardTitle>Staff Profile</CardTitle>
          <CardDescription>Managed by your administrator.</CardDescription>
        </CardHeader>
        <CardContent>
          {profile && (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-ink-muted">Role</dt>
                <dd className="font-medium text-ink">{STAFF_TYPE_LABELS[profile.staffType]}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-muted">Department</dt>
                <dd className="font-medium text-ink">{profile.department ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-muted">Employee ID</dt>
                <dd className="font-medium text-ink">{profile.employeeId}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-muted">Joined</dt>
                <dd className="font-medium text-ink">{formatDate(profile.joinedAt)}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
