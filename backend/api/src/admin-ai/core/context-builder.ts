import { AiMessageRole } from '@prisma/client';
import type { AiChatMessage } from '../providers/model-provider.interface';
import { isAiDomain } from '../tools/ai-tool.types';
import type { RoutedIntent } from './intent-router';

export const HISTORY_TURNS = 20;
const MAX_HISTORY_CHARS = 4_000;

export interface ContextInput {
  history: Array<{ role: AiMessageRole; content: string }>;
  message: string;
  activeModule: string | null;
  intent: RoutedIntent;
  now: Date;
  phiMasked: boolean;
  writesEnabled: boolean;
}

/**
 * Builds the model-facing message list. Prior turns go in as plain text (no
 * tool output is ever replayed from storage). Per-request context -- time,
 * page, policy flags -- rides in the newest user turn, clearly separated from
 * the admin's own words, so the cached system prompt stays byte-identical.
 */
export function buildMessages(input: ContextInput): AiChatMessage[] {
  const history: AiChatMessage[] = input.history.map((turn) => ({
    role: turn.role === AiMessageRole.USER ? 'user' : 'assistant',
    content: turn.content.length > MAX_HISTORY_CHARS ? `${turn.content.slice(0, MAX_HISTORY_CHARS)}...` : turn.content,
  }));

  // The API requires the first turn to be the user's.
  while (history.length > 0 && history[0].role !== 'user') history.shift();

  const module = isAiDomain(input.activeModule) ? input.activeModule : 'unknown';
  const contextLines = [
    `Current time (UTC): ${input.now.toISOString()}`,
    `Admin is viewing the "${module}" module (page context only; it grants no extra access).`,
    input.intent.domains.length > 0 ? `Likely relevant areas: ${input.intent.domains.join(', ')}.` : null,
    input.phiMasked
      ? 'Patient identities are pseudonymised on this deployment.'
      : 'Patient names are visible on this deployment; still share only what the question needs.',
    input.writesEnabled
      ? 'Write proposals are enabled (admin approval required).'
      : 'Write proposals are disabled: you can only read and explain.',
  ].filter(Boolean);

  return [
    ...history,
    {
      role: 'user',
      content: [
        { type: 'text', text: `<request_context>\n${contextLines.join('\n')}\n</request_context>` },
        { type: 'text', text: input.message },
      ],
    },
  ];
}
