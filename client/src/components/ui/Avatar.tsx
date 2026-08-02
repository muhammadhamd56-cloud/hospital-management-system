import { useState, type HTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
} as const

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const initials = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0]]
  return initials
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2)
}

export function Avatar({ name, src, size = 'md', className, ...props }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-brand-100 font-medium text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {src && !imageFailed ? (
        <img
          src={src}
          alt={name}
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </span>
  )
}
