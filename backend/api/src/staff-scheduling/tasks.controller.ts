import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import type { TaskDisplayStatus } from './tasks.mapper';
import { TaskResponse } from './tasks.mapper';
import { TasksService } from './tasks.service';

/** Admin-only task management across all staff. Nurses/staff work their own
 *  tasks through staff-portal, which shares this same service. */
@Controller('staff-scheduling/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async findAll(
    @Query('assignedToId') assignedToId?: string,
    @Query('department') department?: string,
    @Query('status') status?: TaskDisplayStatus,
  ): Promise<{ tasks: TaskResponse[] }> {
    const tasks = await this.tasksService.findAll({ assignedToId, department, status });
    return { tasks };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaskDto,
  ): Promise<{ task: TaskResponse }> {
    const task = await this.tasksService.create(dto, user.id);
    return { task };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<{ task: TaskResponse }> {
    const task = await this.tasksService.update(id, dto, user.id);
    return { task };
  }
}
