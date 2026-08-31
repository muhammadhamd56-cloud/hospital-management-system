import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { AlertTriangle, ListTodo } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card, CardContent } from '@/components/ui/Card'
import { TaskStatusBadge } from '@/features/staffPortal/TaskStatusBadge'
import { TaskPriorityBadge } from '@/features/staffPortal/TaskPriorityBadge'
import { listMyTasks, updateMyTaskStatus } from '@/features/staffPortal/api'
import { ApiError } from '@/lib/apiClient'
import { cn } from '@/utils/cn'
import type { Task, TaskDisplayStatus } from '@/types/staffPortal'

type FilterValue = TaskDisplayStatus | 'all'

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Completed', value: 'completed' },
]

function formatDueAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState<FilterValue>('all')
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightedTaskId = searchParams.get('taskId')
  const taskRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  function refresh() {
    setIsLoading(true)
    setLoadError(false)
    listMyTasks()
      .then((res) => setTasks(res.tasks))
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  // Deep link from a notification (a task assignment/reminder) -> My Tasks.
  // There's no separate task detail view -- everything is already shown
  // inline -- so "opening" the task means switching to the "All" filter
  // (so it isn't hidden by whatever filter is active) and scrolling to/
  // highlighting its card. Left in the URL so a refresh re-highlights it.
  useEffect(() => {
    if (!highlightedTaskId || isLoading) return

    const found = tasks.find((task) => task.id === highlightedTaskId)
    if (!found) {
      toast.error('This task is no longer available.')
      setSearchParams(
        (prev) => {
          prev.delete('taskId')
          return prev
        },
        { replace: true },
      )
      return
    }

    setFilter('all')
    taskRefs.current.get(highlightedTaskId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedTaskId, tasks, isLoading])

  const filteredTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    if (filter === 'all') return sorted
    return sorted.filter((task) => task.status === filter)
  }, [tasks, filter])

  const counts = useMemo(() => {
    const base: Record<FilterValue, number> = { all: tasks.length, pending: 0, in_progress: 0, overdue: 0, completed: 0 }
    tasks.forEach((task) => {
      base[task.status] += 1
    })
    return base
  }, [tasks])

  async function handleStatusChange(task: Task, status: 'in_progress' | 'completed') {
    setMutatingId(task.id)
    try {
      const result = await updateMyTaskStatus(task.id, status)
      setTasks((current) => current.map((item) => (item.id === result.task.id ? result.task : item)))
      toast.success(status === 'completed' ? 'Task marked complete' : 'Task started')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update task')
    } finally {
      setMutatingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">My Tasks</h1>
        <p className="text-sm text-ink-muted">{tasks.length} task{tasks.length === 1 ? '' : 's'} assigned to you</p>
      </div>

      {loadError && !isLoading ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState icon={AlertTriangle} title="Unable to load your tasks." description="Something went wrong. Please try again." />
          <div className="flex justify-center pb-6">
            <Button onClick={refresh}>Try Again</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={
                  filter === option.value
                    ? 'rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white'
                    : 'rounded-full border border-surface-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink'
                }
              >
                {option.label} ({counts[option.value]})
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-card border border-surface-border bg-surface">
              <EmptyState icon={ListTodo} title="No tasks here." description="Nothing matches this filter yet." />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  ref={(node) => {
                    if (node) taskRefs.current.set(task.id, node)
                    else taskRefs.current.delete(task.id)
                  }}
                >
                <Card className={cn(task.id === highlightedTaskId && 'ring-2 ring-brand-500')}>
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink">{task.title}</p>
                        <TaskPriorityBadge priority={task.priority} />
                        <TaskStatusBadge status={task.status} />
                      </div>
                      {task.description && <p className="mt-1 text-sm text-ink-muted">{task.description}</p>}
                      <p className="mt-1 text-xs text-ink-muted">
                        Due {formatDueAt(task.dueAt)}
                        {task.department ? ` · ${task.department}` : ''}
                      </p>
                    </div>
                    {task.status !== 'completed' && (
                      <div className="flex shrink-0 gap-2">
                        {task.status !== 'in_progress' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            isLoading={mutatingId === task.id}
                            onClick={() => handleStatusChange(task, 'in_progress')}
                          >
                            Start
                          </Button>
                        )}
                        <Button
                          size="sm"
                          isLoading={mutatingId === task.id}
                          onClick={() => handleStatusChange(task, 'completed')}
                        >
                          Mark Complete
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
