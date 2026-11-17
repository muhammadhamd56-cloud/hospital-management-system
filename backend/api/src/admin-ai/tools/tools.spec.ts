import { BadRequestException } from '@nestjs/common';
import { AiToolStatus, AuditAction } from '@prisma/client';
import { z } from 'zod';
import { AiPolicyService } from '../control-plane/ai-policy.service';
import { PhiMasker } from '../security/phi-masker';
import { ADMIN, configService, testConfig } from '../testing/admin-ai-test-utils';
import { defineAction } from './ai-action.types';
import { defineTool, type AiToolContext, type AiToolProvider } from './ai-tool.types';
import { ToolDispatcherService } from './tool-dispatcher.service';
import { ToolRegistryService } from './tool-registry.service';

function provider(overrides: Partial<AiToolProvider> = {}): AiToolProvider {
  return {
    domain: 'beds',
    tools: () => [
      defineTool({
        name: 'beds.getOccupancy',
        domain: 'beds',
        mode: 'read',
        permission: 'ai.read.beds',
        description: 'occupancy',
        audit: true,
        input: z.object({ department: z.string().max(10).optional() }),
        output: z.object({ occupied: z.number(), patient: z.string() }),
        execute: async (_args, ctx) => ({
          occupied: 3,
          patient: ctx.phi.patientName('p1', 'Jane Doe'),
          // Not in the output allowlist -- must never reach the model.
          email: 'jane@example.test',
        }),
      }),
      defineTool({
        name: 'beds.slowTool',
        domain: 'beds',
        mode: 'read',
        permission: 'ai.read.beds',
        description: 'slow',
        timeoutMs: 20,
        input: z.object({}),
        output: z.object({}),
        execute: () => new Promise<Record<string, never>>((resolve) => setTimeout(() => resolve({}), 500)),
      }),
      defineTool({
        name: 'beds.failing',
        domain: 'beds',
        mode: 'read',
        permission: 'ai.read.beds',
        description: 'fails',
        input: z.object({}),
        output: z.object({}),
        execute: async () => {
          throw new BadRequestException('Bed not found');
        },
      }),
      defineTool({
        name: 'beds.crashing',
        domain: 'beds',
        mode: 'read',
        permission: 'ai.read.beds',
        description: 'crashes',
        input: z.object({}),
        output: z.object({}),
        execute: async () => {
          throw new Error('connection string postgres://secret@db leaked');
        },
      }),
      defineTool({
        name: 'beds.prepareAssignment',
        domain: 'beds',
        mode: 'propose',
        permission: 'ai.propose.beds',
        description: 'propose',
        input: z.object({ bedId: z.string() }),
        output: z.unknown(),
        execute: async (args) => ({ actionType: 'beds.assign', params: { bedId: args.bedId } }),
      }),
    ],
    actions: () => [
      defineAction({
        type: 'beds.assign',
        domain: 'beds',
        schema: z.object({ bedId: z.string() }),
        preview: async () => 'Assign',
        execute: async () => ({}),
      }),
    ],
    ...overrides,
  };
}

describe('ToolRegistryService', () => {
  it('exposes JSON-schema specs with wire names, filtered by permission and the write flag', () => {
    const registry = new ToolRegistryService([provider()]);
    const policy = new AiPolicyService(configService(testConfig({ enableWrites: false })));
    const specs = registry.specsFor(policy.resolvePermissions(ADMIN), false);

    expect(specs.map((s) => s.name)).toEqual(['beds__getOccupancy', 'beds__slowTool', 'beds__failing', 'beds__crashing']);
    expect(specs[0].inputSchema).toMatchObject({ type: 'object', properties: { department: { type: 'string', maxLength: 10 } } });
    expect(specs[0].inputSchema).not.toHaveProperty('$schema');

    const writable = new AiPolicyService(configService(testConfig({ enableWrites: true })));
    expect(registry.specsFor(writable.resolvePermissions(ADMIN), true).map((s) => s.name)).toContain('beds__prepareAssignment');
    expect(registry.specsFor(new Set(), true)).toEqual([]);
  });

  it('refuses malformed, mis-namespaced or duplicate tools at boot', () => {
    const bad = (name: string, permission = 'ai.read.beds') =>
      provider({
        tools: () => [
          defineTool({
            name,
            domain: 'beds',
            mode: 'read',
            permission: permission as 'ai.read.beds',
            description: 'x',
            input: z.object({}),
            output: z.object({}),
            execute: async () => ({}),
          }),
        ],
        actions: () => [],
      });
    expect(() => new ToolRegistryService([bad('billing.getStuff')])).toThrow('must be named');
    expect(() => new ToolRegistryService([bad('beds.x y')])).toThrow('must be named');
    expect(() => new ToolRegistryService([bad('beds.getStuff', 'ai.read.billing')])).toThrow('must require');
    expect(() => new ToolRegistryService([provider(), provider()])).toThrow('Duplicate');
  });
});

describe('ToolDispatcherService', () => {
  const setup = (enableWrites = false) => {
    const registry = new ToolRegistryService([provider()]);
    const policy = new AiPolicyService(configService(testConfig({ enableWrites })));
    const proposals = { create: jest.fn().mockResolvedValue({ id: 'prop-1', summary: 'Assign', expiresAt: new Date() }) };
    const store = { recordToolInvocation: jest.fn().mockResolvedValue(undefined) };
    const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    const dispatcher = new ToolDispatcherService(registry, policy, proposals as never, store as never, auditLog as never);
    const ctx: AiToolContext = {
      user: ADMIN,
      runId: 'run-1',
      conversationId: 'conv-1',
      phi: new PhiMasker(false),
      signal: new AbortController().signal,
    };
    return { dispatcher, ctx, permissions: policy.resolvePermissions(ADMIN), proposals, store, auditLog };
  };

  it('runs an authorized tool, strips fields outside its output allowlist, masks PHI, and records + audits it', async () => {
    const { dispatcher, ctx, permissions, store, auditLog } = setup();
    const result = await dispatcher.dispatch({ id: 't1', name: 'beds__getOccupancy', input: { department: 'ICU' } }, ctx, permissions);

    expect(result.status).toBe(AiToolStatus.SUCCEEDED);
    const content = JSON.parse(result.content);
    expect(content.occupied).toBe(3);
    expect(content.patient).toMatch(/^Patient P-/);
    expect(result.content).not.toContain('jane@example.test');
    expect(result.content).not.toContain('Jane');
    expect(store.recordToolInvocation).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', toolName: 'beds.getOccupancy', status: AiToolStatus.SUCCEEDED, argKeys: ['department'] }),
    );
    // Argument values (could be a patient name) are never stored.
    expect(JSON.stringify(store.recordToolInvocation.mock.calls)).not.toContain('ICU');
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: AuditAction.VIEW, entityType: 'AiRun', entityId: 'run-1' }));
  });

  it('rejects unknown tools and invalid arguments without echoing argument values', async () => {
    const { dispatcher, ctx, permissions } = setup();
    const unknown = await dispatcher.dispatch({ id: 't1', name: 'sql__execute', input: { q: 'DROP TABLE' } }, ctx, permissions);
    expect(unknown.status).toBe(AiToolStatus.INVALID);

    const invalid = await dispatcher.dispatch(
      { id: 't2', name: 'beds__getOccupancy', input: { department: 'a-very-long-department-name-SECRET' } },
      ctx,
      permissions,
    );
    expect(invalid.status).toBe(AiToolStatus.INVALID);
    expect(invalid.isError).toBe(true);
    expect(invalid.content).toContain('department');
    expect(invalid.content).not.toContain('SECRET');
  });

  it('denies a tool the caller lacks permission for (no permissions = nothing runs)', async () => {
    const { dispatcher, ctx } = setup();
    const result = await dispatcher.dispatch({ id: 't1', name: 'beds__getOccupancy', input: {} }, ctx, new Set());
    expect(result.status).toBe(AiToolStatus.DENIED);
  });

  it('denies proposal tools while writes are disabled, even if the model calls them anyway', async () => {
    const { dispatcher, ctx, permissions, proposals } = setup(false);
    const result = await dispatcher.dispatch({ id: 't1', name: 'beds__prepareAssignment', input: { bedId: 'b1' } }, ctx, permissions);
    expect(result.status).toBe(AiToolStatus.DENIED);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it('turns a propose tool into a pending proposal instead of a change', async () => {
    const { dispatcher, ctx, permissions, proposals } = setup(true);
    const result = await dispatcher.dispatch({ id: 't1', name: 'beds__prepareAssignment', input: { bedId: 'b1' } }, ctx, permissions);
    expect(result.status).toBe(AiToolStatus.SUCCEEDED);
    expect(proposals.create).toHaveBeenCalledWith(ADMIN, { actionType: 'beds.assign', params: { bedId: 'b1' } }, { conversationId: 'conv-1', runId: 'run-1' });
    expect(JSON.parse(result.content)).toMatchObject({ proposalId: 'prop-1', status: 'awaiting_admin_approval' });
    expect(result.proposal?.id).toBe('prop-1');
  });

  it('reports timeouts, domain 4xx messages and hides internal error details', async () => {
    const { dispatcher, ctx, permissions } = setup();
    const slow = await dispatcher.dispatch({ id: 't1', name: 'beds__slowTool', input: {} }, ctx, permissions);
    expect(slow).toMatchObject({ status: AiToolStatus.FAILED, content: 'Error: the tool timed out.' });

    const failing = await dispatcher.dispatch({ id: 't2', name: 'beds__failing', input: {} }, ctx, permissions);
    expect(failing.content).toBe('Error: Bed not found');

    const crashing = await dispatcher.dispatch({ id: 't3', name: 'beds__crashing', input: {} }, ctx, permissions);
    expect(crashing.status).toBe(AiToolStatus.FAILED);
    expect(crashing.content).not.toContain('postgres');
  });
});
