import { AI_DOMAINS, isAiDomain, type AiDomain } from '../tools/ai-tool.types';

const KEYWORDS: Record<AiDomain, RegExp> = {
  dashboard: /\b(dashboard|overview|kpi|metric|performance|summary of (the )?hospital|today at a glance)\b/i,
  emergency: /\b(emergenc|incident|ambulance|sos|urgent case|triage queue)/i,
  announcements: /\b(announce|notice|broadcast|bulletin|memo)/i,
  patients: /\b(patient|registration|registered|mrn)/i,
  doctors: /\b(doctor|physician|consultant|specialist|workload)/i,
  appointments: /\b(appointment|booking|booked|slot|visit|reschedul)/i,
  beds: /\b(bed|ward|occupan|admission|admitted)/i,
  laboratory: /\b(lab|laboratory|test result|pending test|specimen)/i,
  billing: /\b(bill|invoice|revenue|payment|refund|outstanding|overdue|financ)/i,
  reports: /\b(report|export|trend|breakdown|by department|by status)/i,
  staff: /\b(staff|nurse|employee|workforce|headcount|personnel)/i,
  approvals: /\b(approv|pending account|application|sign-?up request|reject)/i,
  scheduling: /\b(shift|roster|schedul|rota|coverage|leave|availability|opening)/i,
  profile: /\b(my profile|my account|my name|my phone|update my)/i,
  settings: /\b(setting|configuration|config|margin|platform fee)/i,
};

export interface RoutedIntent {
  /** Domains the message most likely concerns, best first. Advisory only. */
  domains: AiDomain[];
}

/**
 * Lightweight, deterministic domain detection. It only produces a hint for
 * the model, for run analytics and for choosing which tools to offer -- it never widens what the user is
 * allowed to do, and the UI-reported module is context, not authorization.
 */
export function routeIntent(message: string, activeModule?: string | null): RoutedIntent {
  const matched = AI_DOMAINS.filter((domain) => KEYWORDS[domain].test(message));
  if (isAiDomain(activeModule) && !matched.includes(activeModule)) {
    // The page the admin is on breaks ties ("what's wrong here?").
    matched.push(activeModule);
  }
  return { domains: matched.slice(0, 4) };
}
