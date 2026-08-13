import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Moon, Sun } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { SetPasswordCard } from '@/features/auth/SetPasswordCard'
import { useTheme } from '@/hooks/useTheme'

const profileSchema = z.object({
  name: z.string().min(2, 'Enter your full name'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z.string().min(7, 'Enter a valid phone number'),
})
type ProfileFormValues = z.infer<typeof profileSchema>

function GeneralTab() {
  const { theme, toggleTheme } = useTheme()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: 'Admin User', email: 'admin@medicore.com', phone: '+1 555-0100' },
  })

  async function onSubmit() {
    await new Promise((resolve) => setTimeout(resolve, 400))
    toast.success('Profile updated')
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Input label="Full name" error={errors.name?.message} {...register('name')} />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Email"
                type="email"
                error={errors.email?.message}
                {...register('email')}
              />
              <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
            </div>
            <div className="mt-2 flex justify-end">
              <Button type="submit" isLoading={isSubmitting}>
                Save changes
              </Button>
            </div>
          </form>
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

function NotificationsTab() {
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [smsAlerts, setSmsAlerts] = useState(false)
  const [pushAlerts, setPushAlerts] = useState(true)
  const [weeklyDigest, setWeeklyDigest] = useState(true)

  return (
    <Card>
      <CardContent className="divide-y divide-surface-border">
        <Switch
          label="Email alerts"
          description="Get notified by email for new appointments and results."
          checked={emailAlerts}
          onChange={setEmailAlerts}
        />
        <Switch
          label="SMS alerts"
          description="Receive text messages for urgent updates."
          checked={smsAlerts}
          onChange={setSmsAlerts}
        />
        <Switch
          label="Push notifications"
          description="Browser push notifications for real-time activity."
          checked={pushAlerts}
          onChange={setPushAlerts}
        />
        <Switch
          label="Weekly digest"
          description="A summary email every Monday morning."
          checked={weeklyDigest}
          onChange={setWeeklyDigest}
        />
      </CardContent>
    </Card>
  )
}

function SecurityTab() {
  return <SetPasswordCard />
}

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-ink-muted">Manage your profile, notifications, and security.</p>
      </div>

      <Tabs defaultTab="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
