/** Stable, human-friendly display code derived from the patient's id -- not
 *  a separately stored sequence, just a short deterministic label so staff
 *  have something shorter than a cuid to recognize/search by. */
export function formatPatientId(id: string): string {
  return `PT-${id.slice(-6).toUpperCase()}`
}
