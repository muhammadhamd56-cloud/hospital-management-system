import { useEffect, useState } from 'react'
import { AlertTriangle, Megaphone, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card, CardContent } from '@/components/ui/Card'
import { AnnouncementPriorityBadge } from '@/features/announcements/AnnouncementPriorityBadge'
import { CreateAnnouncementModal } from '@/features/announcements/CreateAnnouncementModal'
import { listAnnouncements } from '@/features/announcements/api'
import { useAuth } from '@/features/auth/useAuth'
import type { Announcement } from '@/types/staffPortal'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function AnnouncementsPage() {
  const { user } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isCreateOpen, setCreateOpen] = useState(false)

  function refresh() {
    setIsLoading(true)
    setLoadError(false)
    listAnnouncements()
      .then((res) => setAnnouncements(res.announcements))
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleCreated(announcement: Announcement) {
    setAnnouncements((current) => [announcement, ...current])
    setCreateOpen(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Announcements</h1>
          <p className="text-sm text-ink-muted">Hospital-wide updates and notices.</p>
        </div>
        {user?.role === 'admin' && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New announcement
          </Button>
        )}
      </div>

      {loadError && !isLoading ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={AlertTriangle} title="Unable to load announcements." description="Something went wrong. Please try again." />
          <div className="flex justify-center pb-6">
            <Button onClick={refresh}>Try Again</Button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
      ) : announcements.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={Megaphone} title="No announcements yet." description="Check back later for hospital-wide updates." />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map((announcement) => (
            <Card key={announcement.id}>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink">{announcement.title}</p>
                  <AnnouncementPriorityBadge priority={announcement.priority} />
                </div>
                <p className="mt-1 text-sm text-ink-muted">{announcement.description}</p>
                <p className="mt-2 text-xs text-ink-muted">
                  {announcement.authorName ?? 'Admin'} · {formatDateTime(announcement.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateAnnouncementModal isOpen={isCreateOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
    </div>
  )
}
