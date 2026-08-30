import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplateResponse } from './templates.mapper';
import { TemplatesService } from './templates.service';

/** Reusable shift-time presets an admin can apply when scheduling a shift. */
@ApiTags('Staff Scheduling')
@ApiBearerAuth()
@Controller('staff-scheduling/templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @ApiOperation({ summary: 'List shift templates' })
  @Get()
  async findAll(): Promise<{ templates: TemplateResponse[] }> {
    const templates = await this.templatesService.findAll();
    return { templates };
  }

  @ApiOperation({ summary: 'Create a shift template' })
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTemplateDto,
  ): Promise<{ template: TemplateResponse }> {
    const template = await this.templatesService.create(dto, user.id);
    return { template };
  }

  @ApiOperation({ summary: 'Update a shift template' })
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<{ template: TemplateResponse }> {
    const template = await this.templatesService.update(id, dto, user.id);
    return { template };
  }

  @ApiOperation({ summary: 'Delete a shift template' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.templatesService.remove(id, user.id);
  }
}
