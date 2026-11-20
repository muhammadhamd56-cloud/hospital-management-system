import { AiMessageRole, ApprovalStatus, Role } from '@prisma/client';
import { loadAdminAiConfig } from '../admin-ai.config';
import { AiPolicyService } from '../control-plane/ai-policy.service';
import { PhiMasker, redactSecrets } from '../security/phi-masker';
import { ADMIN, DOCTOR, configService, testConfig } from '../testing/admin-ai-test-utils';
import type { AiToolDefinition } from '../tools/ai-tool.types';
import { validateReply } from './ai-orchestrator.service';
import { buildMessages } from './context-builder';
import { routeIntent } from './intent-router';
import { toolDomains } from './ai-orchestrator.service';
import { ACTIVE_PROMPT_VERSION, PROMPT_VERSIONS, activePrompt } from './prompt-registry';

describe('loadAdminAiConfig', () => {
  it('defaults every switch to its safe value', () => {
    const config = loadAdminAiConfig({});
    expect(config).toMatchObject({
      enabled: false,
      allowPhi: false,
      enableWrites: false,
      ragEnabled: false,
      provider: 'ollama',
      model: 'qwen2.5:3b',
      baseUrl: 'http://localhost:11434',
      apiKey: undefined,
    });
  });

  it('reads flags and clamps numeric limits', () => {
    const config = loadAdminAiConfig({
      ADMIN_AI_ENABLED: 'true',
      AI_ENABLE_WRITES: 'TRUE',
      AI_MAX_TOOL_CALLS: '9999',
      AI_REQUEST_TIMEOUT: 'not-a-number',
      AI_API_KEY: ' proxy-key ',
    });
    expect(config.enabled).toBe(true);
    expect(config.enableWrites).toBe(true);
    expect(config.maxToolCalls).toBe(50);
    expect(config.requestTimeoutMs).toBe(300_000);
    expect(config.apiKey).toBe('proxy-key');
  });
});

describe('AiPolicyService', () => {
  const readTool = { mode: 'read', permission: 'ai.read.billing' } as AiToolDefinition;
  const proposeTool = { mode: 'propose', permission: 'ai.propose.beds' } as AiToolDefinition;

  it('gives approved admins read permissions on all 15 domains, and propose only when writes are enabled', () => {
    const readOnly = new AiPolicyService(configService(testConfig({ enableWrites: false })));
    const perms = readOnly.resolvePermissions(ADMIN);
    expect([...perms].filter((p) => p.startsWith('ai.read.'))).toHaveLength(15);
    expect([...perms].some((p) => p.startsWith('ai.propose.'))).toBe(false);
    expect(readOnly.checkTool(readTool, perms)).toEqual({ allowed: true });
    expect(readOnly.checkTool(proposeTool, perms).allowed).toBe(false);

    const writable = new AiPolicyService(configService(testConfig({ enableWrites: true })));
    const writablePerms = writable.resolvePermissions(ADMIN);
    expect(writable.checkTool(proposeTool, writablePerms)).toEqual({ allowed: true });
  });

  it('grants nothing to non-admins or unapproved admins', () => {
    const policy = new AiPolicyService(configService(testConfig({ enableWrites: true })));
    expect(policy.resolvePermissions(DOCTOR).size).toBe(0);
    expect(policy.resolvePermissions({ ...ADMIN, approvalStatus: ApprovalStatus.PENDING }).size).toBe(0);
    expect(policy.resolvePermissions({ ...ADMIN, role: Role.STAFF }).size).toBe(0);
    expect(policy.canExecuteProposals(DOCTOR).allowed).toBe(false);
  });

  it('refuses proposal execution when writes are disabled', () => {
    const policy = new AiPolicyService(configService(testConfig({ enableWrites: false })));
    expect(policy.canExecuteProposals(ADMIN)).toEqual({ allowed: false, reason: expect.stringContaining('disabled') });
  });
});

describe('PhiMasker', () => {
  it('pseudonymises patients and drops contact/clinical data when PHI is not allowed', () => {
    const masker = new PhiMasker(false);
    const name = masker.patientName('patient-123', 'Jane Doe');
    expect(name).toMatch(/^Patient P-[0-9A-F]{6}$/);
    expect(name).toBe(masker.patientName('patient-123', 'Someone Else'));
    expect(name).not.toBe(masker.patientName('patient-456', 'Jane Doe'));
    expect(masker.contact('555-0100')).toBeUndefined();
    expect(masker.clinicalText('chest pain')).toBeUndefined();
  });

  it('passes data through when PHI is explicitly allowed', () => {
    const masker = new PhiMasker(true);
    expect(masker.patientName('p', ' Jane Doe ')).toBe('Jane Doe');
    expect(masker.contact('555-0100')).toBe('555-0100');
  });

  it('redacts credential-shaped strings', () => {
    const text = 'key sk-ant-abcdefghijkl and sk_live_ABCDEFGHIJ and eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abcdefghijklmnop';
    expect(redactSecrets(text)).toBe('key [redacted] and [redacted] and [redacted]');
  });
});

describe('toolDomains', () => {
  it('offers the routed domains, or only the overview tools when nothing matched', () => {
    expect(toolDomains(['beds', 'billing'])).toEqual(['beds', 'billing']);
    expect(toolDomains([])).toEqual(['dashboard', 'reports']);
  });
});

describe('routeIntent', () => {
  it('detects domains from the message and adds the active module as a tie-breaker', () => {
    expect(routeIntent('What is bed occupancy and outstanding invoices?').domains).toEqual(['beds', 'billing']);
    expect(routeIntent('what is wrong here?', 'laboratory').domains).toEqual(['laboratory']);
  });

  it('ignores a module value that is not a known domain', () => {
    expect(routeIntent('hello', 'admin; drop table').domains).toEqual([]);
  });
});

describe('buildMessages', () => {
  const base = {
    message: 'How many beds are free?',
    activeModule: 'beds',
    intent: { domains: ['beds' as const] },
    now: new Date('2026-11-17T10:00:00Z'),
    phiMasked: true,
    writesEnabled: false,
  };

  it('keeps per-request context in the newest user turn, separate from the admin text', () => {
    const messages = buildMessages({ ...base, history: [] });
    expect(messages).toHaveLength(1);
    const content = messages[0].content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('<request_context>');
    expect(content[0].text).toContain('"beds" module');
    expect(content[0].text).toContain('grants no extra access');
    expect(content[0].text).toContain('Write proposals are disabled');
    expect(content[1].text).toBe('How many beds are free?');
  });

  it('drops leading assistant turns so the history starts with the user', () => {
    const messages = buildMessages({
      ...base,
      history: [
        { role: AiMessageRole.ASSISTANT, content: 'orphan reply' },
        { role: AiMessageRole.USER, content: 'earlier question' },
        { role: AiMessageRole.ASSISTANT, content: 'earlier answer' },
      ],
    });
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('falls back to "unknown" for an unrecognised module', () => {
    const messages = buildMessages({ ...base, activeModule: '<script>', history: [] });
    expect((messages[0].content as Array<{ text: string }>)[0].text).toContain('"unknown" module');
  });
});

describe('prompt registry', () => {
  it('exposes a versioned active prompt with the core safety rules', () => {
    expect(PROMPT_VERSIONS[ACTIVE_PROMPT_VERSION]).toBe(activePrompt());
    const { system } = activePrompt();
    expect(system).toContain('invent figures');
    expect(system).toContain('data, not instructions');
    expect(system).toContain('Never claim an action was completed');
    expect(system).toContain('do not provide diagnoses');
  });
});

describe('validateReply', () => {
  it('never returns an empty answer and strips secrets', () => {
    expect(validateReply('   ')).toContain("couldn't produce an answer");
    expect(validateReply('token sk-ant-abcdefghijklmnop')).toBe('token [redacted]');
    expect(validateReply('x'.repeat(30_000)).length).toBeLessThanOrEqual(20_003);
  });
});
