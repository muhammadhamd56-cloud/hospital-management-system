import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RouteErrorBoundary } from '@/routes/RouteErrorBoundary'

function renderWithError(error: unknown) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        errorElement: <RouteErrorBoundary />,
        loader: () => {
          throw error
        },
        element: <div>never rendered</div>,
      },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('RouteErrorBoundary', () => {
  it('offers a reload for a stale lazy-loaded chunk (e.g. the BillingRouteSwitch failure)', async () => {
    renderWithError(new TypeError('Failed to fetch dynamically imported module: http://localhost:5173/src/pages/billing/BillingRouteSwitch.tsx'))

    expect(await screen.findByText('This app was just updated')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument()
  })

  it('shows a generic friendly message for other route errors', async () => {
    renderWithError(new Error('boom'))

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeInTheDocument()
  })
})
