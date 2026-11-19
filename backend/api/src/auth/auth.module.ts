import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmailModule } from '../email/email.module';
import { AccountApprovalsModule } from '../account-approvals/account-approvals.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthAuditService } from './auth-audit.service';
import { MfaService } from './mfa.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    EmailModule,
    AccountApprovalsModule,
    // Global already, imported explicitly so AuthModule doesn't depend on
    // AppModule's import order. AuditLogModule imports nothing back.
    AuditLogModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthAuditService, MfaService, GoogleStrategy, JwtStrategy],
  exports: [AuthService, AuthAuditService, MfaService],
})
export class AuthModule {}
