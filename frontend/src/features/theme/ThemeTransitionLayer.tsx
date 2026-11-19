import { useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import gsap from 'gsap'
import { registerThemeTransition, type Theme } from './themeStore'

/* Page background (`--color-surface-alt`) of each theme. The layer is painted
   in the DESTINATION theme's colour, which isn't resolvable from CSS while the
   old theme is still active -- keep in sync with styles/theme.css. */
const LAYER_COLOR: Record<Theme, string> = {
  light: '#f8fafc',
  dark: '#1e293b',
}

const COVER_DURATION = 0.42
const REVEAL_DURATION = 0.48
/** Lets React re-render theme-aware components (charts) under the cover
 *  before the reveal starts. */
const SETTLE_DELAY = 0.06

/** View Transition reveal: one continuous top-to-bottom sweep. */
const REVEAL_MS = 700
/** ≈ GSAP power2.inOut. */
const REVEAL_EASE = 'cubic-bezier(0.455, 0.03, 0.515, 0.955)'

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function supportsViewTransitions() {
  return typeof document.startViewTransition === 'function'
}

/**
 * Animates theme changes top-to-bottom. Mounted once at the app root so every
 * route, modal and layout gets the same transition.
 *
 * Preferred path (View Transitions API): the browser snapshots the page in the
 * old theme, the new theme is applied, and the live new page is revealed over
 * the old snapshot by a soft-edged mask sweeping down (styles in base.css).
 * Content stays visible the whole time.
 *
 * Fallback (no View Transitions support): a GSAP-driven layer in the new
 * theme's colour wipes down, the theme swaps while covered, and the layer's
 * trailing edge moves down to reveal it.
 */
export function ThemeTransitionLayer() {
  const layerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const ctx = gsap.context(() => {}, layer)
    let isTransitioning = false
    let pendingCommit: (() => void) | null = null

    const unregister = registerThemeTransition((next, commit) => {
      // Ignore toggles while a transition is in flight -- the button's icon
      // only flips once the theme commits, so this never feels lost.
      if (isTransitioning) return

      if (prefersReducedMotion()) {
        commit()
        return
      }

      isTransitioning = true

      if (supportsViewTransitions()) {
        const root = document.documentElement
        root.classList.add('theme-wipe')
        // flushSync so theme-aware React components (charts) are already
        // re-rendered when the browser snapshots the new state.
        const transition = document.startViewTransition(() => flushSync(commit))
        transition.ready
          .then(() => {
            root.animate(
              { maskPosition: ['0% 100%', '0% 0%'] },
              {
                duration: REVEAL_MS,
                easing: REVEAL_EASE,
                // Hold the fully-revealed mask until the transition tears
                // down, or the old theme would flash for a frame.
                fill: 'forwards',
                pseudoElement: '::view-transition-new(root)',
              },
            )
          })
          .catch(() => {
            // Transition skipped (e.g. tab hidden): the theme still applied.
          })
        transition.finished.finally(() => {
          root.classList.remove('theme-wipe')
          isTransitioning = false
        })
        return
      }

      pendingCommit = commit
      ctx.add(() => {
        gsap
          .timeline({
            onComplete: () => {
              isTransitioning = false
            },
          })
          .set(layer, {
            display: 'block',
            backgroundColor: LAYER_COLOR[next],
            clipPath: 'inset(0% 0% 100% 0%)',
          })
          .to(layer, { clipPath: 'inset(0% 0% 0% 0%)', duration: COVER_DURATION, ease: 'power2.in' })
          .call(() => {
            pendingCommit = null
            commit()
          })
          .to(layer, {
            clipPath: 'inset(100% 0% 0% 0%)',
            duration: REVEAL_DURATION,
            ease: 'power2.out',
            delay: SETTLE_DELAY,
          })
          .set(layer, { clearProps: 'all' })
      })
    })

    return () => {
      unregister()
      ctx.revert()
      // Never leave a toggle half-applied if we unmount mid-transition.
      pendingCommit?.()
      pendingCommit = null
    }
  }, [])

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      data-testid="theme-transition-layer"
      className="pointer-events-none fixed inset-0 z-[10000] hidden will-change-[clip-path]"
    />
  )
}
