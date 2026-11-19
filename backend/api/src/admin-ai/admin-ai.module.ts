import { Module } from '@nestjs/common';
import { AccountApprovalsModule } from '../account-approvals/account-approvals.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { BedsModule } from '../beds/beds.module';
import { BillingModule } from '../billing/billing.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { EmergencyModule } from '../emergency/emergency.module';
import { LaboratoryModule } from '../laboratory/laboratory.module';
import { PatientsModule } from '../patients/patients.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { ReportsModule } from '../reports/reports.module';
import { StaffModule } from '../staff/staff.module';
import { StaffSchedulingModule } from '../staff-scheduling/staff-scheduling.module';
import { UsersModule } from '../users/users.module';
import { AdminAiEnabledGuard } from './admin-ai-enabled.guard';
import { AdminAiController } from './admin-ai.controller';
import { AiPolicyService } from './control-plane/ai-policy.service';
import { AiOrchestratorService } from './core/ai-orchestrator.service';
import { AnnouncementsAiTools } from './domain-tools/announcements.ai-tools';
import { AppointmentsAiTools } from './domain-tools/appointments.ai-tools';
import { ApprovalsAiTools } from './domain-tools/approvals.ai-tools';
import { BedsAiTools } from './domain-tools/beds.ai-tools';
import { BillingAiTools } from './domain-tools/billing.ai-tools';
import { DashboardAiTools } from './domain-tools/dashboard.ai-tools';
import { DoctorsAiTools } from './domain-tools/doctors.ai-tools';
import { EmergencyAiTools } from './domain-tools/emergency.ai-tools';
import { LaboratoryAiTools } from './domain-tools/laboratory.ai-tools';
import { PatientsAiTools } from './domain-tools/patients.ai-tools';
import { ProfileAiTools } from './domain-tools/profile.ai-tools';
import { ReportsAiTools } from './domain-tools/reports.ai-tools';
import { SchedulingAiTools } from './domain-tools/scheduling.ai-tools';
import { SettingsAiTools } from './domain-tools/settings.ai-tools';
import { StaffAiTools } from './domain-tools/staff.ai-tools';
import { AiMetricsService } from './observability/ai-metrics.service';
import { AiStoreService } from './persistence/ai-store.service';
import { AnthropicModelProvider } from './providers/adapters/anthropic.provider';
import { ModelGatewayService } from './providers/model-gateway.service';
import { AI_MODEL_PROVIDERS, type AiModelProvider } from './providers/model-provider.interface';
import { AI_TOOL_PROVIDERS, type AiToolProvider } from './tools/ai-tool.types';
import { ToolDispatcherService } from './tools/tool-dispatcher.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { AiProposalService } from './workflows/ai-proposal.service';

const DOMAIN_TOOLS = [
  DashboardAiTools,
  EmergencyAiTools,
  AnnouncementsAiTools,
  PatientsAiTools,
  DoctorsAiTools,
  AppointmentsAiTools,
  BedsAiTools,
  LaboratoryAiTools,
  BillingAiTools,
  ReportsAiTools,
  StaffAiTools,
  ApprovalsAiTools,
  SchedulingAiTools,
  ProfileAiTools,
  SettingsAiTools,
];

const MODEL_PROVIDERS = [AnthropicModelProvider];

/**
 * Admin AI Copilot: one orchestrator over a registry of per-domain tools that
 * call the existing domain services through DI. Adds no business logic of its
 * own -- see docs/ai/AI_ARCHITECTURE.md.
 */
@Module({
  imports: [
    AccountApprovalsModule,
    AnnouncementsModule,
    AppointmentsModule,
    BedsModule,
    BillingModule,
    DoctorsModule,
    EmergencyModule,
    LaboratoryModule,
    PatientsModule,
    PlatformSettingsModule,
    ReportsModule,
    StaffModule,
    StaffSchedulingModule,
    UsersModule,
  ],
  controllers: [AdminAiController],
  providers: [
    ...DOMAIN_TOOLS,
    ...MODEL_PROVIDERS,
    {
      provide: AI_TOOL_PROVIDERS,
      useFactory: (...providers: AiToolProvider[]) => providers,
      inject: DOMAIN_TOOLS,
    },
    {
      provide: AI_MODEL_PROVIDERS,
      useFactory: (...providers: AiModelProvider[]) => providers,
      inject: MODEL_PROVIDERS,
    },
    AdminAiEnabledGuard,
    AiPolicyService,
    AiStoreService,
    AiMetricsService,
    ModelGatewayService,
    ToolRegistryService,
    AiProposalService,
    ToolDispatcherService,
    AiOrchestratorService,
  ],
})
export class AdminAiModule {}
