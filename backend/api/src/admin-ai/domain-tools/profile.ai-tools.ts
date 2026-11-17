import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { toClientRole } from '../../common/role.mapper';
import { UpdateProfileDto } from '../../users/dto/update-profile.dto';
import { UsersService } from '../../users/users.service';
import { defineAction, type AiActionHandler } from '../tools/ai-action.types';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { validateDto } from './group-b.shared';

/**
 * Only the admin-relevant UpdateProfileDto fields. The patient-facing fields
 * (date of birth, gender, address, emergency contact) are deliberately not
 * offered. There is no target id: the action always updates the caller.
 */
const profileUpdateParams = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    /** E.164, or "" to clear. */
    phone: z.string().max(32).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to change',
  });

const FIELDS = [
  { field: 'firstName', editable: true, rules: 'Optional; if sent it cannot be empty.' },
  { field: 'lastName', editable: true, rules: 'Optional; if sent it cannot be empty.' },
  {
    field: 'phone',
    editable: true,
    rules: 'Optional; must be a valid phone number in E.164 format (e.g. +923001234567), normalized on save; "" clears it.',
  },
  {
    field: 'dateOfBirth, gender, address, emergencyContactName, emergencyContactPhone',
    editable: false,
    rules: 'Patient-facing fields of the same form; unused for admin accounts and not offered by the copilot.',
  },
  { field: 'email', editable: false, rules: 'Not editable through the profile form.' },
  { field: 'role', editable: false, rules: 'Not editable; roles are fixed once set.' },
  {
    field: 'password, MFA',
    editable: false,
    rules: 'Changed only through the dedicated security screens -- never through the copilot.',
  },
];

/**
 * Profile: the signed-in admin's own profile via UsersService. Output is a
 * strict allowlist -- credentials, MFA secrets/backup codes, OTP and reset
 * state, token versions and lockout counters never leave this tool. The
 * update action only ever targets the caller's own user id.
 */
@Injectable()
export class ProfileAiTools implements AiToolProvider {
  readonly domain = 'profile' as const;

  constructor(private readonly users: UsersService) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'profile.getAdminProfile',
        domain: 'profile',
        mode: 'read',
        permission: 'ai.read.profile',
        description:
          "The signed-in admin's own profile: name, email, phone, role, whether MFA is enabled and when the account was created. Never returns passwords, secrets, codes or tokens.",
        input: z.object({}),
        output: z.object({
          firstName: z.string(),
          lastName: z.string(),
          email: z.string(),
          phone: z.string().nullable(),
          role: z.string(),
          mfaEnabled: z.boolean(),
          createdAt: z.string(),
        }),
        execute: async (_args, ctx) => {
          const user = await this.users.findById(ctx.user.id);
          return {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: toClientRole(user.role),
            mfaEnabled: user.mfaEnabled,
            createdAt: user.createdAt.toISOString(),
          };
        },
      }),
      defineTool({
        name: 'profile.explainFields',
        domain: 'profile',
        mode: 'read',
        permission: 'ai.read.profile',
        description:
          'Static description of the profile fields, which ones the copilot can propose changing and their validation rules (from the profile update form). No data lookup.',
        input: z.object({}),
        output: z.object({
          fields: z.array(z.object({ field: z.string(), editable: z.boolean(), rules: z.string() })),
        }),
        execute: async () => ({ fields: FIELDS }),
      }),
      defineTool({
        name: 'profile.prepareProfileUpdate',
        domain: 'profile',
        mode: 'propose',
        permission: 'ai.propose.profile',
        description:
          "Prepare (not perform) changing the signed-in admin's OWN first name, last name and/or phone (E.164, or \"\" to clear). Creates a proposal the admin must approve. Cannot target any other user.",
        input: profileUpdateParams,
        output: z.unknown(),
        execute: async (args) => ({ actionType: 'profile.update', params: { ...args } }),
      }),
    ];
  }

  actions(): AiActionHandler[] {
    return [
      defineAction({
        type: 'profile.update',
        domain: 'profile',
        schema: profileUpdateParams,
        preview: async (params, user) => {
          await validateDto(UpdateProfileDto, { ...params });
          const current = await this.users.findById(user.id);
          const changes: string[] = [];
          if (params.firstName !== undefined && params.firstName !== current.firstName) {
            changes.push(`first name "${current.firstName}" -> "${params.firstName}"`);
          }
          if (params.lastName !== undefined && params.lastName !== current.lastName) {
            changes.push(`last name "${current.lastName}" -> "${params.lastName}"`);
          }
          if (params.phone !== undefined && (params.phone || null) !== current.phone) {
            changes.push(params.phone ? `phone -> ${params.phone}` : 'clear phone');
          }
          if (changes.length === 0) throw new BadRequestException('Nothing to change: the profile already has these values');
          return `Update your own profile: ${changes.join('; ')}.`;
        },
        execute: async (params, user) => {
          const dto = await validateDto(UpdateProfileDto, { ...params });
          const updated = await this.users.updateProfile(user.id, dto);
          const updatedFields = Object.entries(params)
            .filter(([, value]) => value !== undefined)
            .map(([key]) => key);
          return { userId: updated.id, updatedFields };
        },
      }),
    ];
  }
}
