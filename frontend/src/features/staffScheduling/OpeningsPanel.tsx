import { useEffect, useState } from 'react'
import { CalendarPlus, Lock, Pencil, Trash2, Unlock } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { ShiftOpeningFormModal } from '@/features/staffScheduling/ShiftOpeningFormModal'
import { StaffTypeBadge } from '@/features/staffScheduling/StaffTypeBadge'
import { ShiftTypeBadge } from '@/features/staffScheduling/ShiftTypeBadge'
import { Badge } from '@/components/ui/Badge'
import { deleteShiftOpening, listShiftOpenings, updateShiftOpening } from '@/features/staffScheduling/api'
import { ApiError } from '@/lib/apiClient'
import type { ShiftOpening } from '@/types/staffPortal'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function OpeningsPanel() {
  const [openings, setOpenings] = useState<ShiftOpening[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isFormOpen, setFormOpen] = useState(false)
  const [editingOpening, setEditingOpening] = useState<ShiftOpening | null>(null)
  const [openingToDelete, setOpeningToDelete] = useState<ShiftOpening | null>(null)
  const [isMutating, setIsMutating] = useState(false)

  function refresh() {
    setIsLoading(true)
    setLoadError(false)
    listShiftOpenings()
      .then((res) => setOpenings(res.openings))
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleSaved(opening: ShiftOpening) {
    setOpenings((current) => {
      const exists = current.some((item) => item.id === opening.id)
      const next = exists ? current.map((item) => (item.id === opening.id ? opening : item)) : [opening, ...current]
      return next
    })
    toast.success(editingOpening ? 'Opening updated' : 'Opening posted')
    setFormOpen(false)
    setEditingOpening(null)
  }

  async function handleToggleOpen(opening: ShiftOpening) {
    try {
      const result = await updateShiftOpening(opening.id, { isOpen: !opening.isOpen })
      setOpenings((current) => current.map((item) => (item.id === result.opening.id ? result.opening : item)))
      toast.success(result.opening.isOpen ? 'Opening reopened' : 'Opening closed')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update opening')
    }
  }

  async function handleDelete() {
    if (!openingToDelete) return

    setIsMutating(true)
    try {
      await deleteShiftOpening(openingToDelete.id)
      setOpenings((current) => current.filter((item) => item.id !== openingToDelete.id))
      toast.success('Opening deleted')
      setOpeningToDelete(null)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to delete opening')
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">Post open shifts that eligible staff can browse and apply to.</p>
        <Button
          onClick={() => {
            setEditingOpening(null)
            setFormOpen(true)
          }}
        >
          <CalendarPlus className="size-4" aria-hidden="true" />
          Post opening
        </Button>
      </div>

      {loadError && !isLoading ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={CalendarPlus} title="Unable to load openings." description="Something went wrong." />
          <div className="flex justify-center pb-6">
            <Button onClick={refresh}>Try Again</Button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
      ) : openings.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={CalendarPlus} title="No openings posted" description="Post one for staff to apply to." />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Positions</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openings.map((opening) => (
                <TableRow key={opening.id}>
                  <TableCell>
                    <StaffTypeBadge staffType={opening.requiredStaffType} />
                  </TableCell>
                  <TableCell>
                    {formatDate(opening.date)}
                    <span className="block text-xs text-ink-muted">
                      {formatTime(opening.startTime)}–{formatTime(opening.endTime)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ShiftTypeBadge shiftType={opening.shiftType} />
                  </TableCell>
                  <TableCell>
                    {opening.approvedCount}/{opening.positions}
                  </TableCell>
                  <TableCell>{formatDate(opening.applicationDeadline)}</TableCell>
                  <TableCell>
                    <Badge variant={opening.isOpen ? 'success' : 'neutral'}>{opening.isOpen ? 'Open' : 'Closed'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleToggleOpen(opening)}
                        aria-label={opening.isOpen ? 'Close opening' : 'Reopen opening'}
                      >
                        {opening.isOpen ? <Lock className="size-4" aria-hidden="true" /> : <Unlock className="size-4" aria-hidden="true" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingOpening(opening)
                          setFormOpen(true)
                        }}
                        aria-label="Edit opening"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setOpeningToDelete(opening)}
                        aria-label="Delete opening"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ShiftOpeningFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingOpening(null)
        }}
        opening={editingOpening}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={openingToDelete !== null}
        onClose={() => setOpeningToDelete(null)}
        onConfirm={handleDelete}
        isLoading={isMutating}
        variant="danger"
        title="Delete opening?"
        description="This permanently removes the opening and its applications."
        confirmLabel="Delete"
      />
    </div>
  )
}
