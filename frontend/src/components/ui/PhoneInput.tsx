import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/utils/cn'
import { getCountryOptions, type CountryCode, type CountryOption, type PhoneValue } from '@/lib/phone'

export interface PhoneInputProps {
  label: string
  hideLabel?: boolean
  value: PhoneValue
  onChange: (value: PhoneValue) => void
  error?: string
  hint?: string
}

interface CountrySelectProps {
  label: string
  value: CountryCode
  onChange: (code: CountryCode) => void
}

const PANEL_WIDTH = 256

/** Custom searchable country dropdown -- NOT a native `<select>`, for two
 *  reasons: native `<option>` popups on Windows/Chrome don't render color
 *  flag emoji (they show as blank glyphs or letters), and every use of this
 *  component lives inside a `Modal` (`overflow-y-auto`), which would clip an
 *  ordinary absolutely-positioned dropdown at the modal's scroll boundary.
 *  Portaling into `document.body` with `position: fixed` coordinates (like
 *  `Modal` itself does) sidesteps both problems. */
function CountrySelect({ label, value, onChange }: CountrySelectProps) {
  const options = useMemo(() => getCountryOptions(), [])
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const selected: CountryOption | undefined = options.find((option) => option.code === value)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(needle) ||
        option.dialCode.includes(needle) ||
        option.code.toLowerCase().includes(needle),
    )
  }, [options, query])

  function openDropdown() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - PANEL_WIDTH - 8)
      setPanelPosition({ top: rect.bottom + 4, left, width: Math.max(rect.width, PANEL_WIDTH) })
    }
    setQuery('')
    setHighlightedIndex(0)
    setIsOpen(true)
  }

  useEffect(() => {
    if (!isOpen) return
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setIsOpen(false)
    }

    // Scrolling *inside* the country list (or its search box) shouldn't
    // close it -- only scrolling the page/modal behind it should, since the
    // fixed-position panel would otherwise drift away from its trigger.
    function handleScroll(event: Event) {
      if (panelRef.current?.contains(event.target as Node)) return
      setIsOpen(false)
    }

    function handleResize() {
      setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [query])

  function handleSelect(code: CountryCode) {
    onChange(code)
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setIsOpen(false)
      buttonRef.current?.focus()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((index) => Math.min(index + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = filtered[highlightedIndex]
      if (option) handleSelect(option.code)
    }
  }

  return (
    <>
      <span className="sr-only">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-1.5 rounded-lg border border-surface-border bg-surface px-2.5',
          'text-sm text-ink transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className="text-base leading-none">
            {selected?.flag}
          </span>
          <span className="truncate">{selected?.dialCode}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      </button>

      {isOpen &&
        panelPosition &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: panelPosition.top, left: panelPosition.left, width: panelPosition.width }}
            className="fixed z-[60] overflow-hidden rounded-lg border border-surface-border bg-surface shadow-lg"
          >
            <div className="border-b border-surface-border p-2">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search country or code"
                aria-label="Search country"
                className="h-8 w-full rounded-md border border-surface-border bg-surface-alt px-2 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-brand-500"
              />
            </div>
            <ul id={listboxId} role="listbox" className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No matching countries</li>}
              {filtered.map((option, index) => (
                <li key={option.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.code === value}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelect(option.code)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                      index === highlightedIndex ? 'bg-surface-alt' : undefined,
                      option.code === value && 'font-medium text-ink',
                    )}
                  >
                    <span aria-hidden="true" className="text-base leading-none">
                      {option.flag}
                    </span>
                    <span className="flex-1 truncate">{option.name}</span>
                    <span className="text-ink-muted">{option.dialCode}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  )
}

/** Country-flag + dial-code selector paired with a digits-only national
 *  number field. Emits `{country, nationalNumber}` -- convert with
 *  `toE164`/`fromE164` (see `@/lib/phone`) at the API boundary. */
export function PhoneInput({ label, hideLabel, value, onChange, error, hint }: PhoneInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={hideLabel ? 'sr-only' : 'text-sm font-medium text-ink'}>{label}</label>
      <div className="flex gap-2">
        <div className="w-32 shrink-0 sm:w-36">
          <CountrySelect
            label={`${label} — country`}
            value={value.country}
            onChange={(country) => onChange({ ...value, country })}
          />
        </div>
        <div className="flex-1">
          <Input
            label={`${label} — number`}
            hideLabel
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="Phone number"
            value={value.nationalNumber}
            onChange={(event) => onChange({ ...value, nationalNumber: event.target.value.replace(/\D/g, '') })}
            error={error}
            hint={hint}
          />
        </div>
      </div>
    </div>
  )
}
