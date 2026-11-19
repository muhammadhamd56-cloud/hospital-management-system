import { createHash } from 'node:crypto';

/**
 * Applies the AI_ALLOW_PHI policy to tool output before it reaches the model
 * provider. With PHI disallowed (the default), a patient is identified only by
 * an internal id plus a stable pseudonym ("Patient P-3F9A1C") -- enough for the
 * admin to open the record in the app, nothing that identifies the person to
 * a third party. Contact details and free-text clinical fields are dropped.
 *
 * Tools must route every patient-identifying value through this; the output
 * allowlist schemas then strip anything a tool forgot to project away.
 */
export class PhiMasker {
  constructor(readonly allowPhi: boolean) {}

  /** Stable, non-reversible reference for a patient id. */
  static pseudonym(patientId: string): string {
    return `P-${createHash('sha256').update(`hms-patient:${patientId}`).digest('hex').slice(0, 6).toUpperCase()}`;
  }

  patientName(patientId: string, name: string | null | undefined): string {
    if (this.allowPhi && name && name.trim()) return name.trim();
    return `Patient ${PhiMasker.pseudonym(patientId)}`;
  }

  /** Contact details, dates of birth, addresses: only when PHI is allowed. */
  contact<T>(value: T | null | undefined): T | undefined {
    return this.allowPhi && value !== null && value !== undefined ? value : undefined;
  }

  /** Free-text clinical content (visit reasons, notes, results). Never sent when PHI is off. */
  clinicalText(value: string | null | undefined): string | undefined {
    return this.allowPhi && value ? value : undefined;
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk_(live|test)_[A-Za-z0-9]{8,}/g,
  /whsec_[A-Za-z0-9]{8,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

/** Last line of defence on anything the model writes back to the user or logs. */
export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[redacted]'), text);
}
