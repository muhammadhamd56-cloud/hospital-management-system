import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { AnnouncementResponse } from './announcement.mapper';

/** Readable by any authenticated role (same precedent as DoctorsController's
 *  directory) -- only publishing is admin-only. */
@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  async findAll(): Promise<{ announcements: AnnouncementResponse[] }> {
    const announcements = await this.announcementsService.findAll();
    return { announcements };
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAnnouncementDto,
  ): Promise<{ announcement: AnnouncementResponse }> {
    const announcement = await this.announcementsService.create(dto, user.id);
    return { announcement };
  }
}
