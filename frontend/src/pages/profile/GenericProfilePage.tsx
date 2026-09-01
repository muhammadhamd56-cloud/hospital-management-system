import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/useAuth'
import { ProfileHeader } from '@/features/profile/ProfileHeader'
import { AccountInfoForm } from '@/features/auth/AccountInfoForm'
import { SetPasswordCard } from '@/features/auth/SetPasswordCard'

/** Admin/staff -- this feature's spec only details Doctor and Patient
 *  profile fields, so this role-agnostic fallback covers everyone else
 *  with the same personal-info + password editing the rest of the app
 *  already has, just under /profile like every other role. */
export function GenericProfilePage() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Profile</h1>
        <p className="text-sm text-ink-muted">Your personal and account information</p>
      </div>

      <Card className="animate-fade-in">
        <CardContent>
          <ProfileHeader
            name={user?.fullName ?? ''}
            email={user?.email ?? ''}
            role={user?.role ?? 'staff'}
            picture={user?.picture}
          />
        </CardContent>
      </Card>

      <Card className="animate-fade-in" style={{ animationDelay: '60ms' }}>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your name and phone number.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountInfoForm />
        </CardContent>
      </Card>

      <div className="animate-fade-in" style={{ animationDelay: '90ms' }}>
        <SetPasswordCard />
      </div>
    </div>
  )
}
