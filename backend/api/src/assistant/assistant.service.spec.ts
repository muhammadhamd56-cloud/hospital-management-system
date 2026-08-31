// jest.mock must be declared before importing AssistantService (which
// imports '@anthropic-ai/sdk' itself) -- ts-jest does not hoist jest.mock
// calls above imports the way babel-jest does, so the mock factory has to
// come first textually. Mirrors stripe.service.spec.ts's Stripe SDK mock.
const mockMessagesCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  }));
});

import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { AssistantService } from './assistant.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { BillingService } from '../billing/billing.service';
import { ChatService } from '../chat/chat.service';
import { DoctorPortalService } from '../doctor-portal/doctor-portal.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

function textBlock(text: string) {
  return { type: 'text' as const, text };
}

function toolUseBlock(id: string, name: string, input: Record<string, unknown>) {
  return { type: 'tool_use' as const, id, name, input };
}

const patient: AuthenticatedUser = { id: 'patient-1', email: 'patient@example.com', role: Role.PATIENT };
const doctor: AuthenticatedUser = { id: 'doctor-user-1', email: 'doctor@example.com', role: Role.DOCTOR };

describe('AssistantService', () => {
  let service: AssistantService;
  let configService: { get: jest.Mock };
  let appointmentsService: { listMine: jest.Mock; findAllForAdmin: jest.Mock };
  let billingService: { findMine: jest.Mock; findAll: jest.Mock };
  let chatService: { listInboxDoctors: jest.Mock };
  let doctorPortalService: { listInboxPatients: jest.Mock };

  async function buildService(values: Record<string, string | undefined> = { 'assistant.anthropicApiKey': 'sk-ant-test' }) {
    configService = { get: jest.fn((key: string) => values[key]) };
    appointmentsService = { listMine: jest.fn().mockResolvedValue([]), findAllForAdmin: jest.fn().mockResolvedValue([]) };
    billingService = { findMine: jest.fn().mockResolvedValue([]), findAll: jest.fn().mockResolvedValue([]) };
    chatService = { listInboxDoctors: jest.fn().mockResolvedValue([]) };
    doctorPortalService = { listInboxPatients: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: ConfigService, useValue: configService },
        { provide: AppointmentsService, useValue: appointmentsService },
        { provide: BillingService, useValue: billingService },
        { provide: ChatService, useValue: chatService },
        { provide: DoctorPortalService, useValue: doctorPortalService },
      ],
    }).compile();

    return module.get(AssistantService);
  }

  beforeEach(() => {
    mockMessagesCreate.mockReset();
    (Anthropic as unknown as jest.Mock).mockClear();
  });

  describe('when ANTHROPIC_API_KEY is not configured', () => {
    beforeEach(async () => {
      service = await buildService({});
    });

    it('does not construct an Anthropic client', () => {
      expect(Anthropic).not.toHaveBeenCalled();
    });

    it('throws a clear error instead of silently failing', async () => {
      await expect(service.chat(patient, { message: 'Show my appointments' })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });
  });

  describe('authorization boundaries', () => {
    beforeEach(async () => {
      service = await buildService();
    });

    it('rejects open_invoice for an invoice id not in the caller\'s own scoped list', async () => {
      billingService.findMine.mockResolvedValue([{ id: 'invoice-mine', invoiceNumber: 'INV-0001' }]);

      mockMessagesCreate
        .mockResolvedValueOnce({
          content: [toolUseBlock('t1', 'open_invoice', { invoiceId: 'invoice-belongs-to-someone-else' })],
        })
        .mockResolvedValueOnce({ content: [textBlock("That invoice isn't in your account.")] });

      const result = await service.chat(patient, { message: 'Show me invoice invoice-belongs-to-someone-else' });

      expect(result.action).toBeUndefined();
      // The tool_result fed back to the model must not confirm or deny the
      // other patient's invoice exists -- same generic wording either way.
      const secondCallArgs = mockMessagesCreate.mock.calls[1][0];
      const toolResultMessage = secondCallArgs.messages.at(-1);
      expect(JSON.stringify(toolResultMessage)).toContain('No matching record was found in your account.');
    });

    it('rejects open_appointment for an appointment id not in the caller\'s own scoped list', async () => {
      appointmentsService.findAllForAdmin.mockResolvedValue([{ id: 'appt-mine', doctorName: 'Dr. Own' }]);

      mockMessagesCreate
        .mockResolvedValueOnce({ content: [toolUseBlock('t1', 'open_appointment', { appointmentId: 'appt-not-mine' })] })
        .mockResolvedValueOnce({ content: [textBlock('Not found.')] });

      const result = await service.chat(doctor, { message: 'open appointment appt-not-mine' });

      expect(result.action).toBeUndefined();
    });

    it('rejects open_conversation for a counterpart id not in the caller\'s own inbox', async () => {
      chatService.listInboxDoctors.mockResolvedValue([{ doctorId: 'doc-mine', doctorName: 'Dr. Own', specialization: 'Cardiology' }]);

      mockMessagesCreate
        .mockResolvedValueOnce({ content: [toolUseBlock('t1', 'open_conversation', { counterpartId: 'doc-not-mine' })] })
        .mockResolvedValueOnce({ content: [textBlock('Not found.')] });

      const result = await service.chat(patient, { message: 'open my conversation with doc-not-mine' });

      expect(result.action).toBeUndefined();
    });

    it('rejects navigate_to_page for a page outside the caller\'s role (e.g. patient requesting an admin-only page)', async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({ content: [toolUseBlock('t1', 'navigate_to_page', { page: 'staff' })] })
        .mockResolvedValueOnce({ content: [textBlock("That's not available to you.")] });

      const result = await service.chat(patient, { message: 'open staff page' });

      expect(result.action).toBeUndefined();
    });
  });

  describe('happy paths', () => {
    beforeEach(async () => {
      service = await buildService();
    });

    it('opens the exact invoice by its real id, using the patient-scoped invoice list', async () => {
      billingService.findMine.mockResolvedValue([
        { id: 'invoice-1', invoiceNumber: 'INV-0007', amount: 50, remaining: 50, status: 'pending' },
      ]);

      mockMessagesCreate
        .mockResolvedValueOnce({ content: [toolUseBlock('t1', 'open_invoice', { invoiceId: 'invoice-1' })] })
        .mockResolvedValueOnce({ content: [textBlock('Opening invoice INV-0007.')] });

      const result = await service.chat(patient, { message: 'Show me my invoice' });

      expect(result.action).toEqual({ type: 'open_invoice', path: '/billing?invoiceId=invoice-1' });
      expect(result.reply).toBe('Opening invoice INV-0007.');
      expect(billingService.findMine).toHaveBeenCalledWith('patient-1');
    });

    it('opens the exact conversation using ?patientId= for a doctor caller', async () => {
      doctorPortalService.listInboxPatients.mockResolvedValue([{ patientId: 'patient-42', patientName: 'Neymar Jr' }]);

      mockMessagesCreate
        .mockResolvedValueOnce({ content: [toolUseBlock('t1', 'open_conversation', { counterpartId: 'patient-42' })] })
        .mockResolvedValueOnce({ content: [textBlock('Opening your conversation with Neymar Jr.')] });

      const result = await service.chat(doctor, { message: 'Open my conversation with Neymar' });

      expect(result.action).toEqual({ type: 'open_conversation', path: '/messages?patientId=patient-42' });
    });

    it('resolves navigate_to_page("dashboard") to the real dashboard path', async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({ content: [toolUseBlock('t1', 'navigate_to_page', { page: 'dashboard' })] })
        .mockResolvedValueOnce({ content: [textBlock('Sure — heading to your dashboard.')] });

      const result = await service.chat(patient, { message: 'take me home' });

      expect(result.action).toEqual({ type: 'navigate_to_page', path: '/dashboard' });
    });

    it('returns plain text with no action when the model does not call a tool', async () => {
      mockMessagesCreate.mockResolvedValueOnce({ content: [textBlock('I can only help you navigate this app.')] });

      const result = await service.chat(patient, { message: 'What medicine should I take for a headache?' });

      expect(result.action).toBeUndefined();
      expect(result.reply).toBe('I can only help you navigate this app.');
    });
  });

  describe('bounded tool loop', () => {
    beforeEach(async () => {
      service = await buildService();
    });

    it('stops after the round cap instead of looping forever if the model never produces a final action or answer', async () => {
      billingService.findMine.mockResolvedValue([]);
      // Every round returns another lookup tool call, never an action and
      // never plain text -- simulates a model stuck in a loop.
      mockMessagesCreate.mockResolvedValue({
        content: [toolUseBlock('t', 'find_my_invoices', {})],
      });

      const result = await service.chat(patient, { message: 'keep looking' });

      expect(result.action).toBeUndefined();
      expect(result.reply.length).toBeGreaterThan(0);
      // 4 rounds, one messages.create call each (no closing call since no action was ever set).
      expect(mockMessagesCreate).toHaveBeenCalledTimes(4);
    });
  });
});
