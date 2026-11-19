import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminAiConfig } from '../admin-ai.config';
import {
  AI_MODEL_PROVIDERS,
  AiProviderError,
  type AiGenerateOptions,
  type AiModelProvider,
  type AiModelRequest,
  type AiModelResponse,
} from './model-provider.interface';

/** Resolves AI_PROVIDER to an adapter. The only place that knows which vendor is in use. */
@Injectable()
export class ModelGatewayService {
  private readonly provider: AiModelProvider | null;

  constructor(
    configService: ConfigService,
    @Inject(AI_MODEL_PROVIDERS) providers: AiModelProvider[],
  ) {
    const config = configService.get<AdminAiConfig>('adminAi') as AdminAiConfig;
    this.provider = providers.find((candidate) => candidate.name === config.provider) ?? null;
  }

  get providerName(): string {
    return this.provider?.name ?? 'none';
  }

  isConfigured(): boolean {
    return this.provider?.isConfigured() ?? false;
  }

  generate(request: AiModelRequest, options: AiGenerateOptions): Promise<AiModelResponse> {
    if (!this.provider || !this.provider.isConfigured()) {
      return Promise.reject(new AiProviderError('not_configured', 'The AI provider is not configured.'));
    }
    return this.provider.generate(request, options);
  }
}
