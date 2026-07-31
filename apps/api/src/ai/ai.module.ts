import { Global, Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';
import { PromptService } from './prompt.service';

@Global()
@Module({
  providers: [PromptService, AnthropicService],
  exports: [PromptService, AnthropicService],
})
export class AiModule {}
