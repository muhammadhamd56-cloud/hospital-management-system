import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Unauthenticated by design -- this is what Render (or any uptime monitor)
 *  hits to decide whether to keep routing traffic here, before the caller
 *  has any credentials. */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; database: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }

    return { status: 'ok', database: 'up' };
  }
}
