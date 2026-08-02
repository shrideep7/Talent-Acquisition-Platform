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
  readonly model: string;

  private readonly client: GoogleGenAI;

  constructor(config: ConfigService, prisma: PrismaService, promptService: PromptService) {
    super(prisma, promptService);
    this.client = new GoogleGenAI({
      apiKey: config.get<string>('GEMINI_API_KEY') ?? config.get<string>('GOOGLE_API_KEY'),
    });
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-pro';
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
      const response = await this.client.models.generateContent({
        model: this.model,
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
}
