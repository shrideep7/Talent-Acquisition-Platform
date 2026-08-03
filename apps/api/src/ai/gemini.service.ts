import { GoogleGenAI } from '@google/genai';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z, type ZodType } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { LlmService } from './llm.service';
import { PromptService } from './prompt.service';

/**
 * Google Gemini provider — uses JSON-mode output constrained by the JSON
 * Schema derived from the same Zod schema the rest of the app validates
 * against. The response is always re-validated with Zod; on a validation
 * failure the call is retried once with the validation errors fed back.
 */
@Injectable()
export class GeminiService extends LlmService {
  readonly providerName = 'gemini';

  private readonly client: GoogleGenAI;
  private readonly configuredModel: string;
  /** Set when the configured model 404s and we auto-select an available one. */
  private resolvedModel: string | null = null;

  constructor(config: ConfigService, prisma: PrismaService, promptService: PromptService) {
    super(prisma, promptService);
    this.client = new GoogleGenAI({
      apiKey: config.get<string>('GEMINI_API_KEY') ?? config.get<string>('GOOGLE_API_KEY'),
    });
    this.configuredModel = config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-pro';
  }

  get model(): string {
    return this.resolvedModel ?? this.configuredModel;
  }

  protected async invokeModel<T>(
    systemPrompt: string,
    userContent: string,
    schema: ZodType<T>,
    maxTokens: number,
  ): Promise<T> {
    const jsonSchema = z.toJSONSchema(schema as ZodType<unknown>, { io: 'output' });

    let feedback = '';
    let lastError = 'unknown validation error';
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.generateWithModelFallback({
        contents: feedback ? `${userContent}\n\n${feedback}` : userContent,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
        },
      });

      const blockReason = response.promptFeedback?.blockReason;
      if (blockReason) {
        throw new ServiceUnavailableException(
          `The AI model declined to process this document (${blockReason}). Please review the content and try again.`,
        );
      }

      const text = response.text;
      if (!text) {
        const finish = response.candidates?.[0]?.finishReason ?? 'no output';
        if (String(finish) === 'MAX_TOKENS') {
          throw new ServiceUnavailableException(
            'The document is too large for a single AI pass. Try a shorter document.',
          );
        }
        lastError = `empty response (${finish})`;
        feedback = 'Your previous response was empty. Return ONLY the JSON object matching the schema.';
        continue;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(this.stripCodeFence(text));
      } catch (err) {
        lastError = `invalid JSON: ${(err as Error).message}`;
        feedback =
          'Your previous response was not valid JSON. Return ONLY the raw JSON object matching the schema — no code fences, no commentary.';
        continue;
      }

      const validated = schema.safeParse(parsedJson);
      if (validated.success) return validated.data;

      lastError = validated.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      feedback = `Your previous JSON response failed schema validation with these errors — fix them and return the corrected JSON only:\n${lastError}`;
    }

    this.logger.error(`Gemini structured output failed after retries: ${lastError}`);
    throw new ServiceUnavailableException(
      'AI returned a response that did not match the expected structure — please retry.',
    );
  }

  /** Gemini occasionally wraps JSON-mode output in a markdown fence. */
  private stripCodeFence(text: string): string {
    const trimmed = text.trim();
    const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
    return match ? match[1] : trimmed;
  }

  /**
   * Call generateContent with the current model; when Google reports the
   * model as unavailable/retired for this API key (404), auto-select the best
   * generateContent-capable Gemini model the key can access and retry once.
   */
  private async generateWithModelFallback(params: {
    contents: string;
    config: Record<string, unknown>;
  }): Promise<Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>> {
    try {
      return await this.client.models.generateContent({ model: this.model, ...params });
    } catch (err) {
      if (this.resolvedModel || !this.isModelUnavailable(err)) throw err;
      const picked = await this.pickAvailableModel();
      if (!picked) throw err;
      this.resolvedModel = picked;
      this.logger.warn(
        `Configured Gemini model "${this.configuredModel}" is not available to this API key — ` +
          `auto-selected "${picked}". Pin it explicitly with GEMINI_MODEL to silence this.`,
      );
      return this.client.models.generateContent({ model: this.model, ...params });
    }
  }

  private isModelUnavailable(err: unknown): boolean {
    const message = (err as Error)?.message ?? '';
    const status = (err as { status?: number }).status;
    return (
      status === 404 ||
      /NOT_FOUND|no longer available|not found for API version|is not supported/i.test(message)
    );
  }

  /**
   * Rank the models this key can call: prefer higher Gemini versions, "pro"
   * over "flash", and stable ids over preview/experimental ones. "-latest"
   * aliases rank just below an explicit stable id of the newest line.
   */
  private async pickAvailableModel(): Promise<string | null> {
    try {
      const names: string[] = [];
      const pager = await this.client.models.list();
      for await (const m of pager) {
        const name = (m.name ?? '').replace(/^models\//, '');
        const actions: string[] = (m as { supportedActions?: string[] }).supportedActions ?? [];
        if (!name.startsWith('gemini-')) continue;
        if (/embedding|tts|image|audio|live|native|computer|robotics|nano/i.test(name)) continue;
        if (actions.length > 0 && !actions.includes('generateContent')) continue;
        names.push(name);
      }
      if (names.length === 0) return null;

      const score = (name: string): number => {
        let s = 0;
        const version = /gemini-(\d+(?:\.\d+)?)/.exec(name);
        if (version) s += parseFloat(version[1]) * 1000;
        if (/latest/.test(name)) s += 2500; // alias tracking the newest line
        if (/-pro/.test(name)) s += 100;
        else if (/-flash(?!-lite)/.test(name)) s += 50;
        if (!/preview|exp/i.test(name)) s += 200;
        s -= Math.min(name.length, 60) / 100; // tie-break: shorter/stable ids first
        return s;
      };
      names.sort((a, b) => score(b) - score(a));
      this.logger.log(`Gemini models available to this key (ranked): ${names.slice(0, 5).join(', ')}`);
      return names[0];
    } catch (err) {
      this.logger.error(`Could not list Gemini models: ${(err as Error).message}`);
      return null;
    }
  }
}
