import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ChatService, type ChatInboxDoctor } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import type { ChatThreadPage } from './chat-thread';

/** Patient-side chat — a patient can message any doctor directly, no prior appointment required. */
@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  async listInbox(@CurrentUser() user: AuthenticatedUser): Promise<{ doctors: ChatInboxDoctor[] }> {
    const doctors = await this.chatService.listInboxDoctors(user.id);
    return { doctors };
  }

  @Get(':doctorId')
  async getThread(
    @CurrentUser() user: AuthenticatedUser,
    @Param('doctorId') doctorId: string,
    // Message id: returns the page just older than it (for "load earlier").
    @Query('before') before?: string,
  ): Promise<ChatThreadPage> {
    return this.chatService.getThread(user.id, doctorId, before);
  }

  @Post(':doctorId')
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('doctorId') doctorId: string,
    @Body() dto: SendMessageDto,
  ): Promise<ChatThreadPage> {
    return this.chatService.sendMessage(user.id, doctorId, dto);
  }
}
