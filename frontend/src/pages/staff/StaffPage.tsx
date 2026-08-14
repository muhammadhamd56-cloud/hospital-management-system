import { useEffect, useMemo, useState } from 'react'
import { Search, UserCog, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePagination } from '@/hooks/usePagination'
import { listStaff, type CreateStaffResponse } from '@/features/staff/api'
import { AddStaffModal } from '@/features/staff/AddStaffModal'
import { ApiError } from '@/lib/apiClient'
import { STAFF_ROLE_OPTIONS, type Staff, type StaffRole } from '@/types/staff'

const PAGE_SIZE = 10

const ROLE_FILTER_OPTIONS: { label: string; value: StaffRole | 'all' }[] = [
  { label: 'All roles', value: 'all' },
  ...STAFF_ROLE_OPTIONS,
]

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'all'>('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [revealed, setRevealed] = useState<CreateStaffResponse | null>(null)
  const [copied, setCopied] = useState(false)

  function refresh() {
    setIsLoading(true)
    listStaff()
      .then((res) => setStaff(res.staff))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load staff'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleCreated(result: CreateStaffResponse) {
    setStaff((current) => [result.staff, ...current])
    setRevealed(result)
    setCopied(false)
  }

  async function handleCopy() {
    if (!revealed) return
    await navigator.clipboard.writeText(revealed.tempPassword)
    setCopied(true)
    toast.success('Copied to clipboard')
  }

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase()
    return staff.filter((member) => {
      const matchesQuery =
        !query ||
        member.fullName.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)
      const matchesRole = roleFilter === 'all' || member.role === roleFilter
      return matchesQuery && matchesRole
    })
  }, [staff, search, roleFilter])

  const { page, totalPages, pageItems, setPage } = usePagination(filteredStaff, PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Staff</h1>
          <p className="text-sm text-ink-muted">{staff.length} accounts</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>Add staff account</Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Input
            label="Search staff"
            hideLabel
            icon={Search}
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <Select
            label="Filter by role"
            hideLabel
            options={ROLE_FILTER_OPTIONS}
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as StaffRole | 'all')}
          />
        </div>
      </div>

      {!isLoading && filteredStaff.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-surface">
          <EmptyState
            icon={UserCog}
            title="No staff match your search"
            description="Try a different name, email, or role filter."
          />
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium text-ink">{member.fullName}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <Badge>{STAFF_ROLE_OPTIONS.find((r) => r.value === member.role)?.label ?? member.role}</Badge>
                  </TableCell>
                  <TableCell>{new Date(member.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filteredStaff.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      <AddStaffModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onCreated={handleCreated} />

      <Modal
        isOpen={revealed !== null}
        onClose={() => setRevealed(null)}
        title="Account created"
        description={
          revealed
            ? `Relay this temporary password to ${revealed.staff.fullName} — it won't be shown again.`
            : undefined
        }
      >
        {revealed && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-alt px-4 py-3">
              <code className="text-sm font-medium text-ink">{revealed.tempPassword}</code>
              <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="size-4" aria-hidden="true" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" aria-hidden="true" /> Copy
                  </>
                )}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setRevealed(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
