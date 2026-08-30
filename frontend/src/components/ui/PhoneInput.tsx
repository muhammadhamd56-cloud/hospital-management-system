import { useMemo } from 'react'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { getCountryOptions, type CountryCode, type PhoneValue } from '@/lib/phone'

export interface PhoneInputProps {
  label: string
  hideLabel?: boolean
  value: PhoneValue
  onChange: (value: PhoneValue) => void
  error?: string
  hint?: string
}

/** Country-flag + dial-code selector paired with a digits-only national
 *  number field. Emits `{country, nationalNumber}` -- convert with
 *  `toE164`/`fromE164` (see `@/lib/phone`) at the API boundary. */
export function PhoneInput({ label, hideLabel, value, onChange, error, hint }: PhoneInputProps) {
  const options = useMemo(() => getCountryOptions(), [])
  const countrySelectOptions = useMemo(
    () => options.map((option) => ({ label: option.label, value: option.code })),
    [options],
  )

  return (
    <div className="flex flex-col gap-1.5">
      <label className={hideLabel ? 'sr-only' : 'text-sm font-medium text-ink'}>{label}</label>
      <div className="flex gap-2">
        <div className="w-52 shrink-0">
          <Select
            label={`${label} — country`}
            hideLabel
            value={value.country}
            onChange={(event) => onChange({ ...value, country: event.target.value as CountryCode })}
            options={countrySelectOptions}
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
