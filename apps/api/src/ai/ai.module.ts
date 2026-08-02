import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicService } from './anthropic.service';
import { GeminiService } from './gemini.service';
import { LlmService } from './llm.service';
import { PromptService } from './prompt.service';

/**
 * Provider selection: LLM_PROVIDER=anthropic|gemini. When unset, the provider
 * is inferred from which API key is configured (Anthropic wins when both are
 * present).
 */
function resolveProvider(config: ConfigService): 'anthropic' | 'gemini' {
  const explicit = (config.get<string>('LLM_PROVIDER') ?? '').trim().toLowerCase();
  if (explicit === 'anthropic' || explicit === 'gemini') return explicit;
  if (explicit) {
    throw new Error(`Unknown LLM_PROVIDER "${explicit}" — use "anthropic" or "gemini"`);
  }
  if (config.get<string>('ANTHROPIC_API_KEY')) return 'anthropic';
  if (config.get<string>('GEMINI_API_KEY') || config.get<string>('GOOGLE_API_KEY')) return 'gemini';
  return 'anthropic';
}

@Global()
@Module({
  providers: [
    PromptService,
    AnthropicService,
    GeminiService,
    {
      provide: LlmService,
      inject: [ConfigService, AnthropicService, GeminiService],
      useFactory: (config: ConfigService, anthropic: AnthropicService, gemini: GeminiService) => {
        const provider = resolveProvider(config);
        const service = provider === 'gemini' ? gemini : anthropic;
        new Logger('AiModule').log(`LLM provider: ${provider} (model: ${service.model})`);
        return service;
      },
    },
  ],
  exports: [PromptService, LlmService],
})
export class AiModule {}
