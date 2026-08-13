import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { ManualLoginForm } from '@/features/auth/ManualLoginForm'
import { ManualSignupForm } from '@/features/auth/ManualSignupForm'
import { useAuth } from '@/features/auth/useAuth'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20.4H24v7.2h11.3c-1.6 4.6-6.1 7.9-11.3 7.9-6.9 0-12.4-5.6-12.4-12.5S17.1 10.5 24 10.5c3.1 0 6 1.2 8.1 3.1l5.4-5.4C34.1 5 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 6 1.2 8.1 3.1l5.4-5.4C34.1 5 29.3 3 24 3c-7.6 0-14.1 4.3-17.4 10.6z"
      />
      <path
        fill="#4CAF50"
        d="M24 45c5.2 0 9.9-1.8 13.5-4.9l-6.2-5.3c-2 1.5-4.6 2.4-7.3 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 40.5 16.2 45 24 45z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20.4H24v7.2h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.3C40.8 35.3 44 30.1 44 24c0-1.3-.2-2.4-.4-3.5z"
      />
    </svg>
  )
}

function GoogleButton() {
  const { loginWithGoogle } = useAuth()

  return (
    <Button variant="secondary" className="w-full" onClick={loginWithGoogle}>
      <GoogleIcon />
      Continue with Google
    </Button>
  )
}

function Divider() {
  return (
    <div className="flex w-full items-center gap-3 text-xs text-ink-muted">
      <span className="h-px flex-1 bg-surface-border" aria-hidden="true" />
      or
      <span className="h-px flex-1 bg-surface-border" aria-hidden="true" />
    </div>
  )
}

export function LoginPage() {
  return (
    <Card>
      <CardContent className="py-6">
        <Tabs defaultTab="signin" className="flex flex-col items-center">
          <TabsList>
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <div className="flex w-full flex-col gap-4">
              <ManualLoginForm />
              <Divider />
              <GoogleButton />
            </div>
          </TabsContent>
          <TabsContent value="signup">
            <div className="flex w-full flex-col gap-4">
              <ManualSignupForm />
              <Divider />
              <GoogleButton />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
