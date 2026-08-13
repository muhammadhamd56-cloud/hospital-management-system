import { useEffect, useState } from 'react'
import { Search, Star, UserSearch, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { BookSessionModal } from '@/features/patientDashboard/BookSessionModal'
import { DoctorChatModal } from '@/features/patientDashboard/DoctorChatModal'
import { listDoctors } from '@/features/patientDashboard/api'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'
import type { DirectoryDoctor } from '@/types/directoryDoctor'
import type { PatientAppointment } from '@/types/patientSession'

interface DoctorSearchProps {
  onBooked: (appointment: PatientAppointment) => void
}

export function DoctorSearch({ onBooked }: DoctorSearchProps) {
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [doctors, setDoctors] = useState<DirectoryDoctor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [bookingDoctor, setBookingDoctor] = useState<DirectoryDoctor | null>(null)
  const [chattingDoctor, setChattingDoctor] = useState<DirectoryDoctor | null>(null)

  const isFiltering = query.trim().length > 0 || department.length > 0

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsLoading(true)
      listDoctors({
        q: query.trim() || undefined,
        department: department || undefined,
        limit: isFiltering ? undefined : 6,
      })
        .then((res) => setDoctors(res.doctors))
        .catch((error) => {
          const message = error instanceof ApiError ? error.message : 'Failed to load doctors'
          toast.error(message)
        })
        .finally(() => setIsLoading(false))
    }, 300)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, department])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isFiltering ? 'Find a Doctor' : 'Suggested Doctors'}</CardTitle>
        <CardDescription>Search by name or specialization, or browse suggestions.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Input
              label="Search doctors"
              hideLabel
              icon={Search}
              placeholder="Search by name or specialization…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="sm:w-56">
            <Select
              label="Department"
              hideLabel
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              options={[
                { label: 'All departments', value: '' },
                ...DEPARTMENTS.map((dept) => ({ label: dept, value: dept })),
              ]}
            />
          </div>
        </div>

        {!isLoading && doctors.length === 0 && (
          <EmptyState
            icon={UserSearch}
            title="No doctors found"
            description="Try a different search or department."
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((doctor) => (
            <div
              key={doctor.id}
              className="flex flex-col gap-3 rounded-lg border border-surface-border p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar name={doctor.fullName} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{doctor.fullName}</p>
                  <p className="truncate text-xs text-ink-muted">{doctor.specialization}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Badge variant="brand">{doctor.department}</Badge>
                <span className="flex items-center gap-1 text-xs text-ink-muted">
                  <Star className="size-3.5 fill-warning-500 text-warning-500" aria-hidden="true" />
                  {doctor.rating.toFixed(1)}
                </span>
              </div>
              <Badge variant={doctor.isAvailable ? 'success' : 'neutral'} className="w-fit">
                {doctor.isAvailable ? 'Available' : 'Unavailable'}
              </Badge>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={!doctor.isAvailable}
                  onClick={() => setBookingDoctor(doctor)}
                >
                  {doctor.isAvailable ? 'Book session' : 'Unavailable'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Chat with ${doctor.fullName}`}
                  onClick={() => setChattingDoctor(doctor)}
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <BookSessionModal
        doctor={bookingDoctor}
        onClose={() => setBookingDoctor(null)}
        onBooked={onBooked}
      />

      <DoctorChatModal doctor={chattingDoctor} onClose={() => setChattingDoctor(null)} />
    </Card>
  )
}
