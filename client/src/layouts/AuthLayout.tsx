import { Activity } from 'lucide-react'
import { Outlet } from 'react-router'

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-alt p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Activity className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold text-ink">MediCore HMS</h1>
          <p className="text-sm text-ink-muted">Hospital Management System</p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
