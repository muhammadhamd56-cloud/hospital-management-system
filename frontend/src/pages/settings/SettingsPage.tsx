import { Moon, Sun } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AccountInfoForm } from '@/features/auth/AccountInfoForm'
import { SetPasswordCard } from '@/features/auth/SetPasswordCard'
import { MfaCard } from '@/features/mfa/MfaCard'
import { useTheme } from '@/hooks/useTheme'

function GeneralTab() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Update your name and phone number.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountInfoForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-sm font-medium text-ink">Appearance</p>
            <p className="text-xs text-ink-muted">Switch between light and dark mode.</p>
          </div>
          <Button variant="secondary" onClick={toggleTheme}>
            {theme === 'dark' ? (
              <Sun className="size-4" aria-hidden="true" />
            ) : (
              <Moon className="size-4" aria-hidden="true" />
            )}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function SecurityTab() {
  return (
    <div className="flex flex-col gap-6">
      <SetPasswordCard />
      <MfaCard />
    </div>
  )
}

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-ink-muted">Manage your profile and security.</p>
      </div>

      <Tabs defaultTab="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
