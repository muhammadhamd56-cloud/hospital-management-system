import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import toast from 'react-hot-toast'
import { MapPin, MessageSquarePlus, Phone, ShieldAlert, Siren, UserPlus, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AssignTeamModal } from '@/features/emergency/AssignTeamModal'
import { AddNoteModal } from '@/features/emergency/AddNoteModal'
import { EmergencyStatusBadge } from '@/features/emergency/EmergencyStatusBadge'
import { EmergencyPriorityBadge } from '@/features/emergency/EmergencyPriorityBadge'
import { EmergencyTimeline } from '@/features/emergency/EmergencyTimeline'
import {
  cancelEmergency,
  getEmergency,
  shareEmergencyLocation,
  updateEmergencyDetails,
  updateEmergencyPriority,
  updateEmergencyStatus,
} from '@/features/emergency/api'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import {
  EMERGENCY_PRIORITIES,
  EMERGENCY_PRIORITY_LABELS,
  EMERGENCY_TYPES,
  EMERGENCY_TYPE_LABELS,
  type EmergencyCaseDetail,
  type EmergencyStatus,
} from '@/types/emergency'

/** The single next step a responder can take from the case's current status
 *  -- mirrors EmergencyService's ALLOWED_STATUS_TRANSITIONS on the backend. */
const NEXT_STATUS: Partial<Record<EmergencyStatus, { status: EmergencyStatus; label: string }>> = {
  new: { status: 'acknowledged', label: 'Acknowledge' },
  team_assigned: { status: 'responding', label: 'Mark Responding' },
  responding: { status: 'arrived', label: 'Mark Arrived' },
  arrived: { status: 'resolved', label: 'Mark Resolved' },
}

const PATIENT_CANCELLABLE: EmergencyStatus[] = ['new', 'acknowledged']

export function EmergencyCaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [emergencyCase, setEmergencyCase] = useState<EmergencyCaseDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAssignOpen, setAssignOpen] = useState(false)
  const [isNoteOpen, setNoteOpen] = useState(false)
  const [isCancelOpen, setCancelOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  function refresh() {
    if (!id) return
    setIsLoading(true)
    getEmergency(id)
      .then((res) => setEmergencyCase(res.emergencyCase))
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load emergency case'
        toast.error(message)
        navigate(ROUTES.emergency)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (isLoading || !emergencyCase) {
    return <p className="text-sm text-ink-muted">Loading emergency case...</p>
  }

  const isOwner = user?.role === 'patient' && emergencyCase.patientId === user.id
  const isResponder = user?.role === 'admin' || user?.role === 'doctor' || user?.role === 'staff'
  const canAssign = user?.role === 'admin' || user?.role === 'doctor'
  const nextStep = NEXT_STATUS[emergencyCase.status]

  async function handleAdvanceStatus() {
    if (!id || !nextStep) return
    setIsUpdatingStatus(true)
    try {
      await updateEmergencyStatus(id, nextStep.status)
      refresh()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update status'
      toast.error(message)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  async function handleCancel() {
    if (!id) return
    setIsCancelling(true)
    try {
      await cancelEmergency(id)
      toast.success('Emergency request cancelled')
      refresh()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to cancel request'
      toast.error(message)
    } finally {
      setIsCancelling(false)
      setCancelOpen(false)
    }
  }

  async function handleDetailsChange(emergencyType: string) {
    if (!id) return
    try {
      await updateEmergencyDetails(id, { emergencyType: emergencyType as EmergencyCaseDetail['emergencyType'] })
      refresh()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update emergency type'
      toast.error(message)
    }
  }

  async function handlePriorityChange(priority: string) {
    if (!id) return
    try {
      await updateEmergencyPriority(id, priority as EmergencyCaseDetail['priority'])
      refresh()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update priority'
      toast.error(message)
    }
  }

  function handleShareLocation() {
    if (!id) return
    if (!navigator.geolocation) {
      toast.error('Location is not available on this device')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        shareEmergencyLocation(id, { lat: position.coords.latitude, lng: position.coords.longitude })
          .then(() => {
            toast.success('Location shared')
            refresh()
          })
          .catch((error) => {
            const message = error instanceof ApiError ? error.message : 'Failed to share location'
            toast.error(message)
          })
      },
      () => toast.error('Location permission was denied'),
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink">
            <Siren className="size-6 text-danger-600" aria-hidden="true" />
            Emergency Case
          </h1>
          <p className="text-sm text-ink-muted">Hospital emergency request</p>
        </div>
        <div className="flex items-center gap-2">
          <EmergencyPriorityBadge priority={emergencyCase.priority} />
          <EmergencyStatusBadge status={emergencyCase.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!isOwner && (
                <div>
                  <p className="text-sm text-ink-muted">Patient</p>
                  <p className="font-medium text-ink">{emergencyCase.patientName}</p>
                </div>
              )}

              {isOwner ? (
                <div className="flex flex-col gap-1.5">
                  <Select
                    label="What kind of emergency is this?"
                    value={emergencyCase.emergencyType}
                    onChange={(event) => handleDetailsChange(event.target.value)}
                    options={EMERGENCY_TYPES.map((type) => ({ label: EMERGENCY_TYPE_LABELS[type], value: type }))}
                  />
                  <p className="text-xs text-ink-muted">
                    Select the option that best describes the situation. This is only used to route your request, not a
                    diagnosis.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-ink-muted">Emergency type</p>
                  <p className="font-medium text-ink">{EMERGENCY_TYPE_LABELS[emergencyCase.emergencyType]}</p>
                </div>
              )}

              {emergencyCase.description && (
                <div>
                  <p className="text-sm text-ink-muted">Description</p>
                  <p className="text-ink">{emergencyCase.description}</p>
                </div>
              )}

              {canAssign && (
                <div className="flex flex-col gap-1.5">
                  <Select
                    label="Priority"
                    value={emergencyCase.priority}
                    onChange={(event) => handlePriorityChange(event.target.value)}
                    options={EMERGENCY_PRIORITIES.map((priority) => ({ label: EMERGENCY_PRIORITY_LABELS[priority], value: priority }))}
                  />
                  <p className="text-xs text-ink-muted">
                    Set by hospital staff based on business rules -- not an automated medical severity judgment.
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm text-ink-muted">Location</p>
                {emergencyCase.location ? (
                  <p className="flex items-center gap-1.5 font-medium text-ink">
                    <MapPin className="size-4 text-brand-600" aria-hidden="true" />
                    {emergencyCase.location.lat.toFixed(4)}, {emergencyCase.location.lng.toFixed(4)}
                  </p>
                ) : isOwner ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="text-sm text-ink-muted">Share your current location with the hospital emergency team?</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={handleShareLocation}>
                        Allow Location
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">Not shared</p>
                )}
              </div>

              {emergencyCase.patientContact && (
                <div>
                  <p className="text-sm text-ink-muted">Emergency medical summary</p>
                  <div className="mt-1 flex flex-col gap-1 text-sm text-ink">
                    <span className="flex items-center gap-1.5">
                      <Phone className="size-3.5" aria-hidden="true" />
                      {emergencyCase.patientContact.phone ?? 'Not recorded'}
                    </span>
                    <span>
                      Emergency contact: {emergencyCase.patientContact.emergencyContactName ?? 'Not recorded'}
                      {emergencyCase.patientContact.emergencyContactPhone
                        ? ` (${emergencyCase.patientContact.emergencyContactPhone})`
                        : ''}
                    </span>
                  </div>
                </div>
              )}

              {(emergencyCase.assignedDoctorName || emergencyCase.assignedStaffName || emergencyCase.assignedTeamName) && (
                <div>
                  <p className="text-sm text-ink-muted">Assigned team</p>
                  <p className="font-medium text-ink">
                    {[emergencyCase.assignedDoctorName, emergencyCase.assignedStaffName, emergencyCase.assignedTeamName]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {emergencyCase.notes.length === 0 ? (
                <p className="text-sm text-ink-muted">No notes yet.</p>
              ) : (
                emergencyCase.notes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-surface-border p-3">
                    <p className="text-sm text-ink">{note.body}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {note.authorName ?? 'Unknown'} · {new Date(note.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {isResponder && nextStep && (
                <Button onClick={handleAdvanceStatus} isLoading={isUpdatingStatus}>
                  {nextStep.label}
                </Button>
              )}
              {canAssign && emergencyCase.status === 'acknowledged' && (
                <Button variant="secondary" onClick={() => setAssignOpen(true)}>
                  <UserPlus className="size-4" aria-hidden="true" />
                  Assign Team
                </Button>
              )}
              {isResponder && (
                <Button variant="secondary" onClick={() => setNoteOpen(true)}>
                  <MessageSquarePlus className="size-4" aria-hidden="true" />
                  Add Note
                </Button>
              )}
              {isOwner && PATIENT_CANCELLABLE.includes(emergencyCase.status) && (
                <Button variant="danger" onClick={() => setCancelOpen(true)}>
                  <XCircle className="size-4" aria-hidden="true" />
                  Cancel Request
                </Button>
              )}
              {!nextStep && !canAssign && !isOwner && (
                <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <ShieldAlert className="size-4" aria-hidden="true" />
                  No further action needed.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <EmergencyTimeline events={emergencyCase.timeline} />
            </CardContent>
          </Card>
        </div>
      </div>

      <AssignTeamModal
        isOpen={isAssignOpen}
        caseId={id ?? ''}
        onClose={() => setAssignOpen(false)}
        onAssigned={() => refresh()}
      />
      <AddNoteModal isOpen={isNoteOpen} caseId={id ?? ''} onClose={() => setNoteOpen(false)} onAdded={() => refresh()} />
      <ConfirmDialog
        isOpen={isCancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title="Cancel this emergency request?"
        description="Was this emergency request created by mistake? Cancelling is recorded and cannot be undone."
        confirmLabel="Cancel request"
        variant="danger"
        isLoading={isCancelling}
      />
    </div>
  )
}
