import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ListTodo, Pencil, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { TaskFormModal } from '@/features/staffScheduling/TaskFormModal'
import { TaskStatusBadge } from '@/features/staffPortal/TaskStatusBadge'
import { TaskPriorityBadge } from '@/features/staffPortal/TaskPriorityBadge'
import { listTasks } from '@/features/staffScheduling/api'
import type { Staff } from '@/types/staffScheduling'
import type { Task, TaskDisplayStatus } from '@/types/staffPortal'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function TasksPanel({ staff }: { staff: Staff[] }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TaskDisplayStatus | 'all'>('all')
  const [isFormOpen, setFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  function refresh() {
    setIsLoading(true)
    setLoadError(false)
    listTasks()
      .then((res) => setTasks(res.tasks))
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  const filtered = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    if (statusFilter === 'all') return sorted
    return sorted.filter((task) => task.status === statusFilter)
  }, [tasks, statusFilter])

  function handleSaved(task: Task) {
    setTasks((current) => {
      const exists = current.some((item) => item.id === task.id)
      return exists ? current.map((item) => (item.id === task.id ? task : item)) : [task, ...current]
    })
    toast.success(editingTask ? 'Task updated' : 'Task assigned')
    setFormOpen(false)
    setEditingTask(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-48">
          <Select
            label="Status"
            hideLabel
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TaskDisplayStatus | 'all')}
            options={[
              { label: 'All statuses', value: 'all' },
              { label: 'Pending', value: 'pending' },
              { label: 'In Progress', value: 'in_progress' },
              { label: 'Overdue', value: 'overdue' },
              { label: 'Completed', value: 'completed' },
            ]}
          />
        </div>
        <Button
          onClick={() => {
            setEditingTask(null)
            setFormOpen(true)
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Assign task
        </Button>
      </div>

      {loadError && !isLoading ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={AlertTriangle} title="Unable to load tasks." description="Something went wrong." />
          <div className="flex justify-center pb-6">
            <Button onClick={refresh}>Try Again</Button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={ListTodo} title="No tasks here." description="Assign a task to a staff member." />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium text-ink">{task.title}</TableCell>
                  <TableCell>{task.assignedTo.fullName}</TableCell>
                  <TableCell>{formatDateTime(task.dueAt)}</TableCell>
                  <TableCell>
                    <TaskPriorityBadge priority={task.priority} />
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={task.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingTask(task)
                        setFormOpen(true)
                      }}
                      aria-label={`Edit ${task.title}`}
                      disabled={task.status === 'completed'}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TaskFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingTask(null)
        }}
        staff={staff}
        task={editingTask}
        onSaved={handleSaved}
      />
    </div>
  )
}
