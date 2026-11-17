import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { roundMoney } from '../../common/money.util';
import { UpdatePlatformSettingsDto } from '../../platform-settings/dto/update-platform-settings.dto';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
import type { AdminAiConfig } from '../admin-ai.config';
import { defineAction, type AiActionHandler } from '../tools/ai-action.types';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { validateDto } from './group-b.shared';

/** Provider adapters registered in AdminAiModule (MODEL_PROVIDERS). */
const SUPPORTED_AI_PROVIDERS = ['anthropic'];

/** Same bound as UpdatePlatformSettingsDto (@IsNumber, @Min(0)); no upper bound exists there. */
const marginParams = z.object({ consultationMargin: z.number().finite().min(0) }).strict();

/**
 * Settings: platform settings via PlatformSettingsService plus the
 * non-secret Admin AI switches from ConfigService. The API key (and any other
 * secret or raw env value) is never read into output -- only whether one is
 * configured. The only proposable change is the consultation margin.
 */
@Injectable()
export class SettingsAiTools implements AiToolProvider {
  readonly domain = 'settings' as const;

  constructor(
    private readonly platformSettings: PlatformSettingsService,
    private readonly config: ConfigService,
  ) {}

  private aiConfig(): AdminAiConfig {
    return this.config.get<AdminAiConfig>('adminAi') as AdminAiConfig;
  }

  /** Non-secret view of the AI config. Built field by field so nothing else can slip through. */
  private aiFlags() {
    const ai = this.aiConfig();
    return {
      enabled: ai.enabled,
      provider: ai.provider,
      model: ai.model,
      writesEnabled: ai.enableWrites,
      allowPhi: ai.allowPhi,
      ragEnabled: ai.ragEnabled,
      apiKeyConfigured: Boolean(ai.apiKey),
    };
  }

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'settings.getConfiguration',
        domain: 'settings',
        mode: 'read',
        permission: 'ai.read.settings',
        description:
          'Current platform settings (consultation margin added to every new consultation invoice) and the Admin AI switches: enabled, provider, model, writesEnabled, allowPhi, ragEnabled and whether an API key is configured (yes/no only). Never returns secrets or environment values.',
        input: z.object({}),
        output: z.object({
          platform: z.object({ consultationMargin: z.number() }),
          adminAi: z.object({
            enabled: z.boolean(),
            provider: z.string(),
            model: z.string(),
            writesEnabled: z.boolean(),
            allowPhi: z.boolean(),
            ragEnabled: z.boolean(),
            apiKeyConfigured: z.boolean(),
          }),
        }),
        execute: async () => ({ platform: await this.platformSettings.getSettings(), adminAi: this.aiFlags() }),
      }),
      defineTool({
        name: 'settings.findInconsistencies',
        domain: 'settings',
        mode: 'read',
        permission: 'ai.read.settings',
        description:
          'Check settings for inconsistencies: consultation margin negative, non-numeric or with more than 2 decimals (the settings form requires >= 0, money is stored to cents); AI enabled or writes enabled without an API key or with an unsupported provider; RAG switched on although it is not implemented; PHI sharing with the model provider switched on. Returns each issue with a severity.',
        input: z.object({}),
        output: z.object({
          checked: z.array(z.string()),
          issues: z.array(z.object({ severity: z.enum(['error', 'warning', 'info']), setting: z.string(), issue: z.string() })),
        }),
        execute: async () => {
          const { consultationMargin } = await this.platformSettings.getSettings();
          const ai = this.aiFlags();
          type Severity = 'error' | 'warning' | 'info';
          const issues: Array<{ severity: Severity; setting: string; issue: string }> = [];
          const add = (severity: Severity, setting: string, issue: string) => issues.push({ severity, setting, issue });
          if (!Number.isFinite(consultationMargin)) {
            add('error', 'consultationMargin', 'Consultation margin is not a valid number');
          } else {
            if (consultationMargin < 0) {
              add('error', 'consultationMargin', 'Consultation margin is negative (must be >= 0)');
            }
            if (roundMoney(consultationMargin) !== consultationMargin) {
              add('warning', 'consultationMargin', 'Consultation margin has more than 2 decimal places');
            }
          }
          const providerSupported = SUPPORTED_AI_PROVIDERS.includes(ai.provider);
          if (ai.enabled && !providerSupported) {
            add('error', 'AI_PROVIDER', `Provider "${ai.provider}" has no registered adapter`);
          }
          if (ai.enabled && !ai.apiKeyConfigured) {
            add('error', 'AI_API_KEY', 'Admin AI is enabled but no API key is configured');
          }
          if (ai.writesEnabled && (!ai.apiKeyConfigured || !providerSupported)) {
            add('warning', 'AI_ENABLE_WRITES', 'AI writes are enabled while the model provider is not configured');
          }
          if (ai.writesEnabled && !ai.enabled) {
            add('info', 'AI_ENABLE_WRITES', 'AI writes are enabled but Admin AI itself is disabled (no effect)');
          }
          if (ai.ragEnabled) {
            add('warning', 'AI_RAG_ENABLED', 'RAG is switched on but knowledge retrieval is not implemented yet');
          }
          if (ai.allowPhi) {
            add('warning', 'AI_ALLOW_PHI', 'Patient identifiers are sent to the external model provider');
          }
          const checked = ['consultationMargin', 'AI_PROVIDER', 'AI_API_KEY', 'AI_ENABLE_WRITES', 'AI_RAG_ENABLED', 'AI_ALLOW_PHI'];
          return { checked, issues };
        },
      }),
      defineTool({
        name: 'settings.prepareConfigurationChange',
        domain: 'settings',
        mode: 'propose',
        permission: 'ai.propose.settings',
        description:
          'Prepare (not perform) changing the platform consultation margin (a number >= 0, rounded to cents) that is added to every NEW consultation invoice; existing invoices are not changed. This is the only setting the copilot can propose changing -- AI/environment switches are deployment config. Creates a proposal the admin must approve.',
        input: marginParams,
        output: z.unknown(),
        execute: async (args) => ({
          actionType: 'settings.updateConsultationMargin',
          params: { consultationMargin: args.consultationMargin },
        }),
      }),
    ];
  }

  actions(): AiActionHandler[] {
    return [
      defineAction({
        type: 'settings.updateConsultationMargin',
        domain: 'settings',
        schema: marginParams,
        preview: async (params) => {
          const dto = await validateDto(UpdatePlatformSettingsDto, { consultationMargin: params.consultationMargin });
          const next = roundMoney(dto.consultationMargin);
          const { consultationMargin: current } = await this.platformSettings.getSettings();
          if (next === current) throw new BadRequestException(`The consultation margin is already ${current.toFixed(2)}`);
          return `Change the consultation margin from ${current.toFixed(2)} to ${next.toFixed(2)}. Applies to new consultation invoices only.`;
        },
        execute: async (params, user) => {
          const dto = await validateDto(UpdatePlatformSettingsDto, { consultationMargin: params.consultationMargin });
          const result = await this.platformSettings.updateConsultationMargin(dto.consultationMargin, user.id);
          return { consultationMargin: result.consultationMargin };
        },
      }),
    ];
  }
}
