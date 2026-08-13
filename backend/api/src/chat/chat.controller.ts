import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ChatService, type ChatInboxDoctor } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import type { ChatMessageResponse } from './chat.mapper';

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
  ): Promise<{ thread: ChatMessageResponse[] }> {
    const thread = await this.chatService.getThread(user.id, doctorId);
    return { thread };
  }

  @Post(':doctorId')
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('doctorId') doctorId: string,
    @Body() dto: SendMessageDto,
  ): Promise<{ thread: ChatMessageResponse[] }> {
    const thread = await this.chatService.sendMessage(user.id, doctorId, dto.body);
    return { thread };
  }
}
