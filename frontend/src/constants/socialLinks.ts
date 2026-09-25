import type { SocialLinks } from '@/types/socialLinks'

export type SocialLinkKey = keyof SocialLinks

export const SOCIAL_LINK_LABELS: Record<SocialLinkKey, string> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  twitter: 'X / Twitter',
  facebook: 'Facebook',
  instagram: 'Instagram',
}
