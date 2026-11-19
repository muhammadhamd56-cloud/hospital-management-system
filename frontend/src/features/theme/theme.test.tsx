import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import gsap from 'gsap'
import { useTheme } from '@/hooks/useTheme'
import { ThemeTransitionLayer } from './ThemeTransitionLayer'

function ThemeLabel({ id }: { id: string }) {
  const { theme } = useTheme()
  return <span data-testid={id}>{theme}</span>
}

function ToggleButton() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button type="button" aria-pressed={theme === 'dark'} onClick={toggleTheme}>
      Dark mode
    </button>
  )
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  document.documentElement.classList.remove('dark')
  gsap.globalTimeline.timeScale(20)
})

afterEach(() => {
  gsap.globalTimeline.timeScale(1)
  // @ts-expect-error -- jsdom has no matchMedia; remove our mock again
  delete window.matchMedia
})

describe('useTheme', () => {
  it('re-renders every consumer when toggled from one of them', async () => {
    render(
      <>
        <ToggleButton />
        <ThemeLabel id="chart-a" />
        <ThemeLabel id="chart-b" />
      </>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }))

    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByTestId('chart-a')).toHaveTextContent('dark')
    expect(screen.getByTestId('chart-b')).toHaveTextContent('dark')
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('hms-theme')).toBe('dark')
  })

  it('reads the theme that index.html applied before paint', () => {
    document.documentElement.classList.add('dark')
    render(<ThemeLabel id="label" />)
    expect(screen.getByTestId('label')).toHaveTextContent('dark')
  })
})

describe('ThemeTransitionLayer', () => {
  it('swaps the theme mid-wipe, then hides the layer again', async () => {
    mockReducedMotion(false)
    render(
      <>
        <ToggleButton />
        <ThemeTransitionLayer />
      </>,
    )
    const layer = screen.getByTestId('theme-transition-layer')

    fireEvent.click(screen.getByRole('button', { name: 'Dark mode' }))

    // The theme is not applied until the layer covers the screen.
    expect(document.documentElement).not.toHaveClass('dark')

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
    await waitFor(() => expect(layer.style.display).toBe(''))
  })

  it('ignores toggles while a transition is already running', async () => {
    mockReducedMotion(false)
    render(
      <>
        <ToggleButton />
        <ThemeTransitionLayer />
      </>,
    )
    const button = screen.getByRole('button', { name: 'Dark mode' })
    const layer = screen.getByTestId('theme-transition-layer')

    // Synchronous clicks, like a double-click or a held Enter key.
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
    await waitFor(() => expect(layer.style.display).toBe(''))
    expect(document.documentElement).toHaveClass('dark')
  })

  it('switches instantly when the user prefers reduced motion', async () => {
    mockReducedMotion(true)
    render(
      <>
        <ToggleButton />
        <ThemeTransitionLayer />
      </>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }))

    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByTestId('theme-transition-layer').style.display).toBe('')
  })

  it('applies a pending toggle if it unmounts mid-transition', async () => {
    mockReducedMotion(false)
    const { unmount } = render(
      <>
        <ToggleButton />
        <ThemeTransitionLayer />
      </>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }))
    act(() => unmount())

    expect(document.documentElement).toHaveClass('dark')
  })

  describe('with the View Transitions API', () => {
    afterEach(() => {
      // @ts-expect-error -- remove the jsdom stubs again
      delete document.startViewTransition
      // @ts-expect-error -- remove the jsdom stubs again
      delete document.documentElement.animate
    })

    it('reveals the new theme with a top-to-bottom mask sweep', async () => {
      mockReducedMotion(false)
      let finish!: () => void
      const finished = new Promise<void>((resolve) => (finish = resolve))
      document.startViewTransition = vi.fn((update: () => void) => {
        update()
        return { ready: Promise.resolve(), finished, updateCallbackDone: Promise.resolve(), skipTransition: vi.fn() }
      }) as unknown as typeof document.startViewTransition
      const animate = vi.fn()
      document.documentElement.animate = animate

      render(
        <>
          <ToggleButton />
          <ThemeTransitionLayer />
        </>,
      )
      const button = screen.getByRole('button', { name: 'Dark mode' })
      fireEvent.click(button)
      fireEvent.click(button) // ignored: a transition is in flight

      expect(document.startViewTransition).toHaveBeenCalledTimes(1)
      expect(document.documentElement).toHaveClass('dark', 'theme-wipe')
      await waitFor(() =>
        expect(animate).toHaveBeenCalledWith(
          { maskPosition: ['0% 100%', '0% 0%'] },
          expect.objectContaining({ pseudoElement: '::view-transition-new(root)', fill: 'forwards' }),
        ),
      )

      act(() => finish())
      await waitFor(() => expect(document.documentElement).not.toHaveClass('theme-wipe'))
      expect(document.documentElement).toHaveClass('dark')
    })
  })
})
