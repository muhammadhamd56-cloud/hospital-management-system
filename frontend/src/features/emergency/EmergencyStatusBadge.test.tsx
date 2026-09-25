import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmergencyStatusBadge } from '@/features/emergency/EmergencyStatusBadge'
import { EMERGENCY_STATUSES, EMERGENCY_STATUS_LABELS } from '@/types/emergency'

describe('EmergencyStatusBadge', () => {
  it.each(EMERGENCY_STATUSES)('renders the label for status "%s" alongside an icon, not color alone', (status) => {
    const { container } = render(<EmergencyStatusBadge status={status} />)

    expect(screen.getByText(EMERGENCY_STATUS_LABELS[status])).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
