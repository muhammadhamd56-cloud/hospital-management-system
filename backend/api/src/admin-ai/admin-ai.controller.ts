import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { AiFeedbackRating, Role } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminAiEnabledGuard } from './admin-ai-enabled.guard';
import type { AdminAiConfig } from './admin-ai.config';
import { AiOrchestratorService, type CopilotEvent } from './core/ai-orchestrator.service';
import {
  ApproveProposalDto,
  CreateConversationDto,
  FeedbackDto,
  PageQueryDto,
  RejectProposalDto,
  RenameConversationDto,
  SendCopilotMessageDto,
  UsageQueryDto,
} from './dto/admin-ai.dto';
import { AiMetricsService } from './observability/ai-metrics.service';
import { AiStoreService } from './persistence/ai-store.service';
import { ModelGatewayService } from './providers/model-gateway.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { AiProposalService } from './workflows/ai-proposal.service';

const HEARTBEAT_MS = 15_000;

/**
 * Admin AI Copilot API. Admin-only at the route (JwtAuthGuard re-validates the
 * session and approval on every request; RolesGuard requires ADMIN), and every
 * service call is additionally scoped to the caller's own conversations.
 */
@Controller('admin-ai')
@UseGuards(AdminAiEnabledGuard, JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAiController {
  private readonly config: AdminAiConfig;

  constructor(
    configService: ConfigService,
    private readonly orchestrator: AiOrchestratorService,
    private readonly store: AiStoreService,
    private readonly proposals: AiProposalService,
    private readonly registry: ToolRegistryService,
    private readonly gateway: ModelGatewayService,
    private readonly metrics: AiMetricsService,
  ) {
    this.config = configService.get<AdminAiConfig>('adminAi') as AdminAiConfig;
  }

  @Get('status')
  status() {
    return {
      enabled: true,
      providerConfigured: this.gateway.isConfigured(),
      provider: this.gateway.providerName,
      model: this.config.model,
      writesEnabled: this.config.enableWrites,
      phiAllowed: this.config.allowPhi,
      ragEnabled: false,
    };
  }

  @Get('capabilities')
  capabilities() {
    return this.registry.catalogue().filter((tool) => tool.mode === 'read' || this.config.enableWrites);
  }

  @Get('conversations')
  listConversations(@CurrentUser() user: AuthenticatedUser, @Query() query: PageQueryDto) {
    return this.store.listConversations(user.id, query.cursor);
  }

  @Post('conversations')
  async createConversation(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConversationDto) {
    const conversation = await this.store.createConversation(
      user.id,
      dto.title?.trim() || 'New conversation',
      dto.activeModule ?? null,
    );
    return { id: conversation.id, title: conversation.title, activeModule: conversation.activeModule, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt };
  }

  @Patch('conversations/:id')
  async renameConversation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RenameConversationDto) {
    const conversation = await this.store.renameConversation(user.id, id, dto.title.trim());
    return { id: conversation.id, title: conversation.title };
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  async deleteConversation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.store.deleteConversation(user.id, id);
  }

  @Get('conversations/:id/messages')
  listMessages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: PageQueryDto) {
    return this.store.listMessages(user.id, id, query.before);
  }

  @Get('conversations/:id/proposals')
  async listProposals(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.store.getOwnedConversation(user.id, id);
    return this.proposals.listForConversation(user, id);
  }

  /**
   * Streams the answer as Server-Sent Events over this POST response (cookie
   * auth + CSRF header, so no token ever goes in a URL). Pre-flight failures
   * (ownership, budget, duplicate) are ordinary JSON errors; once streaming
   * starts, failures arrive as an `error` event. Closing the connection
   * cancels the run.
   */
  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendCopilotMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    const prepared = await this.orchestrator.prepare(user, id, {
      message: dto.message.trim(),
      activeModule: dto.activeModule ?? null,
      requestKey: dto.requestKey,
    });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // no-transform keeps the global compression middleware from buffering the stream.
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    const write = (event: CopilotEvent) => {
      if (!res.writableEnded && !res.destroyed) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': keep-alive\n\n');
    }, HEARTBEAT_MS);

    try {
      await this.orchestrator.execute(prepared, write, abort.signal);
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }

  @Get('proposals/:id')
  getProposal(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.proposals.get(user, id);
  }

  @Post('proposals/:id/approve')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ApproveProposalDto) {
    return this.proposals.approve(user, id, dto.paramsHash);
  }

  @Post('proposals/:id/reject')
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RejectProposalDto) {
    return this.proposals.reject(user, id, dto.note);
  }

  @Post('messages/:id/feedback')
  @HttpCode(204)
  async feedback(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: FeedbackDto): Promise<void> {
    await this.store.setFeedback(user.id, id, dto.rating === 'up' ? AiFeedbackRating.UP : AiFeedbackRating.DOWN, dto.comment);
  }

  @Get('usage')
  usage(@Query() query: UsageQueryDto) {
    return this.metrics.usage(query.days ?? 7);
  }
}
