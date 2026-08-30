import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Search, User as UserIcon, Stethoscope } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { listPatients } from '@/features/patients/api'
import { listDoctors } from '@/features/patientDashboard/api'
import { ROUTES } from '@/constants/routes'
import type { PatientListItem } from '@/types/patientDirectory'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300
const MAX_RESULTS_PER_GROUP = 5

interface SearchResultsProps {
  isSearching: boolean
  hasResults: boolean
  trimmedQuery: string
  patients: PatientListItem[]
  doctors: DirectoryDoctor[]
  onSelectPatient: (patient: PatientListItem) => void
  onSelectDoctor: (doctor: DirectoryDoctor) => void
}

function SearchResults({
  isSearching,
  hasResults,
  trimmedQuery,
  patients,
  doctors,
  onSelectPatient,
  onSelectDoctor,
}: SearchResultsProps) {
  if (isSearching) {
    return <p className="px-4 py-6 text-center text-sm text-ink-muted">Searching…</p>
  }

  if (!hasResults) {
    return (
      <p className="px-4 py-6 text-center text-sm text-ink-muted">No matches for “{trimmedQuery}”</p>
    )
  }

  return (
    <div className="max-h-96 overflow-y-auto py-2">
      {patients.length > 0 && (
        <div>
          <p className="px-4 py-1 text-xs font-semibold uppercase text-ink-muted">Patients</p>
          {patients.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => onSelectPatient(patient)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-surface-alt"
            >
              <UserIcon className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-ink">{patient.fullName}</span>
                <span className="ml-1.5 text-xs text-ink-muted">{patient.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {doctors.length > 0 && (
        <div>
          <p className="px-4 py-1 text-xs font-semibold uppercase text-ink-muted">Doctors</p>
          {doctors.map((doctor) => (
            <button
              key={doctor.id}
              type="button"
              onClick={() => onSelectDoctor(doctor)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-surface-alt"
            >
              <Stethoscope className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-ink">{doctor.fullName}</span>
                <span className="ml-1.5 text-xs text-ink-muted">{doctor.specialization}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Admin/doctor-only: searches the patient and doctor directories they can
 *  already reach via /patients and /doctors, and jumps straight to the
 *  matching record. Both endpoints are already scoped server-side (a doctor
 *  only sees their own patients), so this can't surface anything the caller
 *  couldn't already see on those pages.
 *
 *  Below the `sm` breakpoint there's no room for an always-visible input
 *  next to the menu toggle and profile controls, so a search icon opens a
 *  full-width takeover instead -- same search, no lost functionality. */
export function GlobalSearch() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMobileExpanded, setIsMobileExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [doctors, setDoctors] = useState<DirectoryDoctor[]>([])

  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setIsMobileExpanded(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setIsMobileExpanded(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setPatients([])
      setDoctors([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)

    const timer = setTimeout(() => {
      const needle = trimmed.toLowerCase()

      const doctorsPromise = listDoctors({ q: trimmed, limit: MAX_RESULTS_PER_GROUP })
        .then((res) => res.doctors)
        .catch(() => [])

      const patientsPromise = listPatients()
        .then((res) =>
          res.patients
            .filter(
              (patient) =>
                patient.fullName.toLowerCase().includes(needle) ||
                patient.email.toLowerCase().includes(needle),
            )
            .slice(0, MAX_RESULTS_PER_GROUP),
        )
        .catch(() => [])

      Promise.all([patientsPromise, doctorsPromise]).then(([patientResults, doctorResults]) => {
        setPatients(patientResults)
        setDoctors(doctorResults)
        setIsSearching(false)
      })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  function closeMobileSearch() {
    setIsMobileExpanded(false)
    setIsOpen(false)
    setQuery('')
  }

  function handleSelectPatient(patient: PatientListItem) {
    setIsOpen(false)
    setIsMobileExpanded(false)
    setQuery('')
    navigate(ROUTES.patients, { state: { openPatientId: patient.id } })
  }

  function handleSelectDoctor(doctor: DirectoryDoctor) {
    setIsOpen(false)
    setIsMobileExpanded(false)
    setQuery('')
    navigate(ROUTES.doctors, { state: { openDoctorId: doctor.id } })
  }

  const trimmedQuery = query.trim()
  const hasResults = patients.length > 0 || doctors.length > 0
  const showDropdown = isOpen && trimmedQuery.length >= MIN_QUERY_LENGTH
  const resultsProps = {
    isSearching,
    hasResults,
    trimmedQuery,
    patients,
    doctors,
    onSelectPatient: handleSelectPatient,
    onSelectDoctor: handleSelectDoctor,
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsMobileExpanded(true)}
        aria-label="Search"
        className="rounded-lg p-2 text-ink-muted hover:bg-surface-alt sm:hidden"
      >
        <Search className="size-5" aria-hidden="true" />
      </button>

      {isMobileExpanded && (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-surface-border bg-surface sm:hidden">
          <div className="flex h-16 items-center gap-2 px-4">
            <button
              type="button"
              onClick={closeMobileSearch}
              aria-label="Close search"
              className="shrink-0 rounded-lg p-2 text-ink-muted hover:bg-surface-alt"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <Input
                label="Search"
                hideLabel
                icon={Search}
                placeholder="Search patients, doctors…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setIsOpen(true)}
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>
          {showDropdown && (
            <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-surface-border">
              <SearchResults {...resultsProps} />
            </div>
          )}
        </div>
      )}

      <div className="hidden min-w-0 sm:block sm:max-w-xs lg:max-w-sm">
        <Input
          label="Search"
          hideLabel
          icon={Search}
          placeholder="Search patients, doctors…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsOpen(true)}
          autoComplete="off"
        />

        {showDropdown && (
          <div className="absolute left-0 top-full z-40 mt-2 w-full min-w-80 rounded-card border border-surface-border bg-surface shadow-xl">
            <SearchResults {...resultsProps} />
          </div>
        )}
      </div>
    </div>
  )
}
