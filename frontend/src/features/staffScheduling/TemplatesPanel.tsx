import { useState } from 'react'
import { CalendarRange, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { deleteTemplate } from '@/features/staffScheduling/api'
import { ShiftTypeBadge } from '@/features/staffScheduling/ShiftTypeBadge'
import { TemplateFormModal } from '@/features/staffScheduling/TemplateFormModal'
import { ApiError } from '@/lib/apiClient'
import type { ShiftTemplate } from '@/types/staffScheduling'

interface TemplatesPanelProps {
  templates: ShiftTemplate[]
  isLoading: boolean
  onTemplatesChange: (templates: ShiftTemplate[]) => void
}

export function TemplatesPanel({ templates, isLoading, onTemplatesChange }: TemplatesPanelProps) {
  const [isFormOpen, setFormOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null)
  const [templateToDelete, setTemplateToDelete] = useState<ShiftTemplate | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function handleSaved(template: ShiftTemplate) {
    const exists = templates.some((existing) => existing.id === template.id)
    const next = exists
      ? templates.map((existing) => (existing.id === template.id ? template : existing))
      : [...templates, template].sort((a, b) => a.name.localeCompare(b.name))
    onTemplatesChange(next)
    toast.success(exists ? 'Template updated' : 'Template created')
  }

  async function handleDelete() {
    if (!templateToDelete) return

    setIsDeleting(true)
    try {
      await deleteTemplate(templateToDelete.id)
      onTemplatesChange(templates.filter((template) => template.id !== templateToDelete.id))
      toast.success('Template deleted')
      setTemplateToDelete(null)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to delete template')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          Reusable start/end times admins can apply when scheduling a shift, so the same hours don't need to be
          re-entered every time.
        </p>
        <Button
          onClick={() => {
            setEditingTemplate(null)
            setFormOpen(true)
          }}
        >
          Create template
        </Button>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
      ) : templates.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={CalendarRange} title="No templates yet" description="Create one to speed up scheduling." />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium text-ink">{template.name}</TableCell>
                  <TableCell>
                    <ShiftTypeBadge shiftType={template.shiftType} />
                  </TableCell>
                  <TableCell>{template.startTime}</TableCell>
                  <TableCell>{template.endTime}</TableCell>
                  <TableCell>{template.description ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingTemplate(template)
                          setFormOpen(true)
                        }}
                        aria-label={`Edit ${template.name}`}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setTemplateToDelete(template)}
                        aria-label={`Delete ${template.name}`}
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

      <TemplateFormModal
        isOpen={isFormOpen}
        onClose={() => setFormOpen(false)}
        template={editingTemplate}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={templateToDelete !== null}
        onClose={() => setTemplateToDelete(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        variant="danger"
        title="Delete template?"
        description={templateToDelete ? `This deletes the "${templateToDelete.name}" template.` : undefined}
        confirmLabel="Delete"
      />
    </div>
  )
}
