import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AssistantService, type AssistantChatResponse } from './assistant.service';
import { AssistantChatDto } from './dto/assistant-chat.dto';

/** Available to every authenticated role -- role-appropriate behavior is
 *  enforced inside AssistantService, not by a route-level @Roles gate. */
@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssistantChatDto,
  ): Promise<AssistantChatResponse> {
    return this.assistantService.chat(user, dto);
  }
}
