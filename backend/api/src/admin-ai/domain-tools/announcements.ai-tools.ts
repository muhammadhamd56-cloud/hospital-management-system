import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { z } from 'zod';
import { AnnouncementsService } from '../../announcements/announcements.service';
import { CreateAnnouncementDto, type ClientAnnouncementPriority } from '../../announcements/dto/create-announcement.dto';
import { defineAction, type AiActionHandler } from '../tools/ai-action.types';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';

const priority = z.enum(['normal', 'important', 'urgent'] satisfies ClientAnnouncementPriority[]);

/** Mirrors CreateAnnouncementDto; preview additionally runs the DTO's own class-validator rules. */
const publishParams = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().min(1).max(2000),
    priority: priority.optional(),
  })
  .strict();

/** The service returns the 50 most recent announcements; nothing older is reachable. */
const SERVICE_WINDOW = 50;

/**
 * Announcements: read the recent feed (AnnouncementsService.findAll) and
 * propose publishing one, executed through AnnouncementsService.create after
 * admin approval (which also notifies every active staff account). The model
 * drafts the wording itself; no tool is needed for that.
 */
@Injectable()
export class AnnouncementsAiTools implements AiToolProvider {
  readonly domain = 'announcements' as const;

  constructor(private readonly announcements: AnnouncementsService) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'announcements.listRecent',
        domain: 'announcements',
        mode: 'read',
        permission: 'ai.read.announcements',
        description: `Most recent staff announcements, newest first (title, full text, priority, author, createdAt). Optional priority filter. Only the ${SERVICE_WINDOW} newest announcements are searchable; returns at most \`limit\` of them plus the matching count.`,
        input: z.object({
          priority: priority.optional(),
          limit: z.number().int().min(1).max(SERVICE_WINDOW).default(10),
        }),
        output: z.object({
          matching: z.number(),
          returned: z.number(),
          announcements: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              description: z.string(),
              priority: z.string(),
              authorName: z.string().nullable(),
              createdAt: z.string(),
            }),
          ),
        }),
        execute: async (args) => {
          const all = await this.announcements.findAll();
          const matching = all.filter((a) => !args.priority || a.priority === args.priority);
          const rows = matching.slice(0, args.limit).map((a) => ({
            id: a.id,
            title: a.title,
            description: a.description,
            priority: a.priority,
            authorName: a.authorName,
            createdAt: a.createdAt,
          }));
          return { matching: matching.length, returned: rows.length, announcements: rows };
        },
      }),
      defineTool({
        name: 'announcements.preparePublish',
        domain: 'announcements',
        mode: 'propose',
        permission: 'ai.propose.announcements',
        description:
          'Prepare (not perform) publishing a staff announcement. Creates a proposal the admin must approve; on approval it is published and every active staff account is notified. ' +
          'title: 1-150 chars, description: 1-2000 chars, priority: normal (default) | important | urgent. Never include patient-identifying or clinical details.',
        input: z.object({
          title: z.string().trim().min(1).max(150),
          description: z.string().trim().min(1).max(2000),
          priority: priority.optional(),
        }),
        output: z.unknown(),
        execute: async (args) => ({
          actionType: 'announcements.publish',
          params: { title: args.title, description: args.description, ...(args.priority ? { priority: args.priority } : {}) },
        }),
      }),
    ];
  }

  actions(): AiActionHandler[] {
    return [
      defineAction({
        type: 'announcements.publish',
        domain: 'announcements',
        schema: publishParams,
        preview: async (params) => {
          const dto = await toValidatedDto(params);
          const excerpt = dto.description.length > 160 ? `${dto.description.slice(0, 157)}...` : dto.description;
          return `Publish a ${dto.priority ?? 'normal'}-priority announcement "${dto.title}" and notify all active staff: ${excerpt}`;
        },
        execute: async (params, user) => {
          const dto = await toValidatedDto(params);
          const created = await this.announcements.create(dto, user.id);
          return { announcementId: created.id, title: created.title, priority: created.priority, createdAt: created.createdAt };
        },
      }),
    ];
  }
}

/** Reuses CreateAnnouncementDto's own class-validator rules so the AI path can't drift from the API's. */
async function toValidatedDto(params: z.infer<typeof publishParams>): Promise<CreateAnnouncementDto> {
  const dto = plainToInstance(CreateAnnouncementDto, { ...params });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    throw new BadRequestException(`Invalid announcement: ${messages.join('; ')}`);
  }
  return dto;
}
