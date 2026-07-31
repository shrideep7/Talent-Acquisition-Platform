import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export interface PromptTemplate {
  name: string;
  version: string;
  content: string;
}

/**
 * Loads versioned prompt templates from ai/prompts/<name>.<version>.md.
 * The highest version per name wins. Templates use {{variable}} placeholders.
 */
@Injectable()
export class PromptService implements OnModuleInit {
  private readonly logger = new Logger(PromptService.name);
  private readonly prompts = new Map<string, PromptTemplate>();

  onModuleInit() {
    const candidates = [
      join(__dirname, 'prompts'), // dist/ai/prompts (built, assets copied)
      join(process.cwd(), 'src', 'ai', 'prompts'), // dev fallback
      join(process.cwd(), 'apps', 'api', 'src', 'ai', 'prompts'), // monorepo root cwd
    ];
    const dir = candidates.find((c) => existsSync(c));
    if (!dir) {
      this.logger.error('No prompt directory found — AI features will fail');
      return;
    }
    for (const file of readdirSync(dir)) {
      const match = /^(?<name>[a-z0-9-]+)\.(?<version>v\d+)\.md$/.exec(file);
      if (!match?.groups) continue;
      const { name, version } = match.groups;
      const existing = this.prompts.get(name);
      if (!existing || this.versionNum(version) > this.versionNum(existing.version)) {
        this.prompts.set(name, {
          name,
          version,
          content: readFileSync(join(dir, file), 'utf8'),
        });
      }
    }
    this.logger.log(
      `Loaded prompts: ${[...this.prompts.values()].map((p) => `${p.name}@${p.version}`).join(', ')}`,
    );
  }

  private versionNum(v: string): number {
    return parseInt(v.replace('v', ''), 10);
  }

  get(name: string): PromptTemplate {
    const prompt = this.prompts.get(name);
    if (!prompt) throw new Error(`Prompt template not found: ${name}`);
    return prompt;
  }

  /** Render a template by substituting {{key}} placeholders. */
  render(name: string, vars: Record<string, string>): { text: string; version: string } {
    const prompt = this.get(name);
    let text = prompt.content;
    for (const [key, value] of Object.entries(vars)) {
      text = text.split(`{{${key}}}`).join(value);
    }
    return { text, version: prompt.version };
  }
}
