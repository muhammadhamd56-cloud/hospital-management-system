import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { ROLE_LABELS, type Role } from '@/types/role'

interface ProfileHeaderProps {
  name: string
  email: string
  role: Role
  picture?: string | null
}

/** No upload capability exists anywhere in this app (no storage/multer
 *  setup at all) -- rather than invent a new file-upload subsystem, the
 *  photo is shown read-only from the existing `picture` field (populated
 *  for Google accounts; initials otherwise, via the existing Avatar
 *  fallback), same as everywhere else the app already shows an avatar. */
export function ProfileHeader({ name, email, role, picture }: ProfileHeaderProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <Avatar name={name} src={picture ?? undefined} size="xl" />
      <div>
        <h2 className="text-xl font-semibold text-ink">{name}</h2>
        <p className="text-sm text-ink-muted">{email}</p>
      </div>
      <Badge variant="brand">{ROLE_LABELS[role]}</Badge>
    </div>
  )
}
