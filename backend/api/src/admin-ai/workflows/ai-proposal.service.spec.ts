import { BadRequestException, ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { AiProposalStatus, type AiActionProposal } from '@prisma/client';
import { z } from 'zod';
import { AiPolicyService } from '../control-plane/ai-policy.service';
import { ADMIN, DOCTOR, OTHER_ADMIN, configService, testConfig } from '../testing/admin-ai-test-utils';
import { defineAction } from '../tools/ai-action.types';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { AiProposalService, hashProposal, stableStringify } from './ai-proposal.service';

function buildService(options: { enableWrites?: boolean; previewImpl?: jest.Mock; executeImpl?: jest.Mock } = {}) {
  const preview = options.previewImpl ?? jest.fn().mockResolvedValue('Publish "Visiting hours"');
  const execute = options.executeImpl ?? jest.fn().mockResolvedValue({ announcementId: 'ann-1' });
  const registry = new ToolRegistryService([
    {
      domain: 'announcements',
      tools: () => [],
      actions: () => [
        defineAction({
          type: 'announcements.publish',
          domain: 'announcements',
          schema: z.object({ title: z.string().min(1), body: z.string().min(1) }).strict(),
          preview,
          execute,
        }),
      ],
    },
  ]);
  const config = testConfig({ enableWrites: options.enableWrites ?? true, proposalTtlMinutes: 15 });
  const policy = new AiPolicyService(configService(config));

  const rows = new Map<string, AiActionProposal>();
  const prisma = {
    aiActionProposal: {
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `prop-${rows.size + 1}`,
          status: AiProposalStatus.PENDING,
          decidedById: null,
          decidedAt: null,
          decisionNote: null,
          executedAt: null,
          result: null,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        } as AiActionProposal;
        rows.set(row.id, row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }) => {
        const row = rows.get(where.id);
        return row && row.requestedById === where.requestedById ? { ...row } : null;
      }),
      findMany: jest.fn(async () => [...rows.values()]),
      updateMany: jest.fn(async ({ where, data }) => {
        const row = rows.get(where.id);
        if (!row || row.status !== where.status) return { count: 0 };
        if (where.expiresAt?.gt && !(row.expiresAt > where.expiresAt.gt)) return { count: 0 };
        rows.set(row.id, { ...row, ...data });
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = { ...(rows.get(where.id) as AiActionProposal), ...data };
        rows.set(where.id, row);
        return row;
      }),
    },
  };
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AiProposalService(configService(config), prisma as never, registry, policy, auditLog as never);
  return { service, rows, preview, execute, auditLog, prisma };
}

const refs = { conversationId: 'conv-1', runId: 'run-1' };
const draft = { actionType: 'announcements.publish', params: { title: 'Visiting hours', body: 'Open 9-5' } };

describe('stableStringify / hashProposal', () => {
  it('is independent of key order but sensitive to any value change', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }));
    expect(hashProposal('x', { a: 1 })).not.toBe(hashProposal('x', { a: 2 }));
    expect(hashProposal('x', { a: 1 })).not.toBe(hashProposal('y', { a: 1 }));
  });
});

describe('AiProposalService', () => {
  it('creates a pending, expiring proposal with a hash after validating and previewing it', async () => {
    const { service, preview, auditLog } = buildService();
    const view = await service.create(ADMIN, draft, refs);

    expect(view.status).toBe('pending');
    expect(view.paramsHash).toBe(hashProposal('announcements.publish', draft.params));
    expect(view.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'AiActionProposal', entityId: view.id }));
  });

  it('rejects unknown actions, extra/invalid params, failing business rules and disabled writes', async () => {
    await expect(buildService().service.create(ADMIN, { actionType: 'billing.refund', params: {} }, refs)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      buildService().service.create(ADMIN, { actionType: 'announcements.publish', params: { ...draft.params, sneaky: true } }, refs),
    ).rejects.toThrow();
    const failing = buildService({ previewImpl: jest.fn().mockRejectedValue(new BadRequestException('Title taken')) });
    await expect(failing.service.create(ADMIN, draft, refs)).rejects.toThrow('Title taken');
    await expect(buildService({ enableWrites: false }).service.create(ADMIN, draft, refs)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(buildService().service.create(DOCTOR, draft, refs)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('executes the stored params exactly once on approval, re-running the business checks first', async () => {
    const { service, preview, execute } = buildService();
    const view = await service.create(ADMIN, draft, refs);

    const approved = await service.approve(ADMIN, view.id, view.paramsHash);
    expect(approved.status).toBe('executed');
    expect(approved.result).toEqual({ announcementId: 'ann-1' });
    expect(preview).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(draft.params, ADMIN);

    // Replay of the same approval does nothing.
    await expect(service.approve(ADMIN, view.id, view.paramsHash)).rejects.toBeInstanceOf(ConflictException);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('refuses an approval whose hash does not match what was reviewed, or whose stored params were modified', async () => {
    const { service, rows, execute } = buildService();
    const view = await service.create(ADMIN, draft, refs);

    await expect(service.approve(ADMIN, view.id, 'f'.repeat(64))).rejects.toBeInstanceOf(ConflictException);

    rows.set(view.id, { ...(rows.get(view.id) as AiActionProposal), params: { title: 'Changed', body: 'Open 9-5' } });
    await expect(service.approve(ADMIN, view.id, view.paramsHash)).rejects.toBeInstanceOf(ConflictException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses expired proposals', async () => {
    const { service, rows, execute } = buildService();
    const view = await service.create(ADMIN, draft, refs);
    rows.set(view.id, { ...(rows.get(view.id) as AiActionProposal), expiresAt: new Date(Date.now() - 1000) });

    await expect(service.approve(ADMIN, view.id, view.paramsHash)).rejects.toBeInstanceOf(GoneException);
    expect(rows.get(view.id)?.status).toBe(AiProposalStatus.EXPIRED);
    expect(execute).not.toHaveBeenCalled();
  });

  it('only lets the requesting admin see or decide a proposal', async () => {
    const { service } = buildService();
    const view = await service.create(ADMIN, draft, refs);
    await expect(service.get(OTHER_ADMIN, view.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.approve(OTHER_ADMIN, view.id, view.paramsHash)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records a failed execution without claiming success, and blocks approval once writes are turned off', async () => {
    const { service } = buildService({ executeImpl: jest.fn().mockRejectedValue(new BadRequestException('Bed is no longer available')) });
    const view = await service.create(ADMIN, draft, refs);
    const failed = await service.approve(ADMIN, view.id, view.paramsHash);
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('Bed is no longer available');

    const disabled = buildService({ enableWrites: false });
    await expect(disabled.service.approve(ADMIN, 'prop-1', 'a'.repeat(64))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a pending proposal once', async () => {
    const { service, execute } = buildService();
    const view = await service.create(ADMIN, draft, refs);
    expect((await service.reject(ADMIN, view.id, 'not now')).status).toBe('rejected');
    await expect(service.reject(ADMIN, view.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.approve(ADMIN, view.id, view.paramsHash)).rejects.toBeInstanceOf(ConflictException);
    expect(execute).not.toHaveBeenCalled();
  });
});
