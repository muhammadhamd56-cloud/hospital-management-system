import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountApprovalsModule } from '../account-approvals/account-approvals.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, AccountApprovalsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
