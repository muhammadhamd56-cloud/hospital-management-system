import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useUnsavedChangesGuard } from '@/features/profile/useUnsavedChangesGuard'

/** Drop anywhere inside a page with a dirty-trackable form -- blocks
 *  in-app navigation and browser tab close/refresh while `isDirty`,
 *  prompting with the same message either way. */
export function UnsavedChangesPrompt({ isDirty }: { isDirty: boolean }) {
  const blocker = useUnsavedChangesGuard(isDirty)
  const isBlocked = blocker.state === 'blocked'

  return (
    <ConfirmDialog
      isOpen={isBlocked}
      onClose={() => isBlocked && blocker.reset()}
      onConfirm={() => isBlocked && blocker.proceed()}
      title="Leave this page?"
      description="You have unsaved changes. Are you sure you want to leave?"
      confirmLabel="Leave"
      cancelLabel="Stay"
      variant="danger"
    />
  )
}
