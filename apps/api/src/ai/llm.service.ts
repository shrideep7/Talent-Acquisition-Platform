import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { ZodType } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { PromptService } from './prompt.service';

export interface StructuredCallOptions<T> {
  /** Prompt template name (ai/prompts/<name>.<version>.md). Becomes the system prompt. */
  promptName: string;
  /** Variables substituted into the template. */
  promptVars?: Record<string, string>;
  /** The user-turn input document(s). */
  userContent: string;
  /** Strict output schema. */
  schema: ZodType<T>;
  /** Identifier for the schema, part of the cache key. Bump when the schema changes. */
  schemaVersion: string;
  maxTokens?: number;
  /** Skip the cache (e.g. when the user explicitly asks to re-run). */
  noCache?: boolean;
  /**
   * Link the cache entry to a candidate when the input embeds their CV
   * content — DPDP erasure purges linked entries.
   */
  candidateId?: string;
}

export interface StructuredCallResult<T> {
  data: T;
  promptVersion: string;
  model: string;
  cached: boolean;
  /** Content-hash key of the cache row for this call (for late candidate tagging). */
  cacheKey: string;
}

/**
 * Provider-agnostic gateway for all LLM calls. Concrete providers (Anthropic
 * Claude, Google Gemini) implement invokeModel(); this base supplies the
 * determinism strategy shared by both: strict schema validation plus a
 * content-hash cache keyed on (provider, model, prompt name+version, schema
 * version, exact input), so identical inputs always return the identical
 * stored response and scores are reproducible across re-runs.
 *
 * Selection happens in AiModule via the LLM_PROVIDER env var; consumers
 * inject this abstract class.
 */
@Injectable()
export abstract class LlmService {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly promptService: PromptService,
  ) {}

  /** Short provider key used in cache keys, e.g. "anthropic", "gemini". */
  abstract readonly providerName: string;
  /** Model identifier used for calls and cache keys. */
  abstract readonly model: string;

  /**
   * Perform one structured model call. Implementations must return data that
   * satisfies the schema (the base re-validates cached entries only) and
   * should map provider errors to ServiceUnavailableException with an
   * operator-readable message.
   */
  protected abstract invokeModel<T>(
    systemPrompt: string,
    userContent: string,
    schema: ZodType<T>,
    maxTokens: number,
  ): Promise<T>;

  async structured<T>(opts: StructuredCallOptions<T>): Promise<StructuredCallResult<T>> {
    const { text: systemPrompt, version: promptVersion } = this.promptService.render(
      opts.promptName,
      opts.promptVars ?? {},
    );

    const cacheKey = createHash('sha256')
      .update(
        [
          this.providerName,
          this.model,
          opts.promptName,
          promptVersion,
          opts.schemaVersion,
          opts.userContent,
        ].join(' '),
      )
      .digest('hex');

    if (!opts.noCache) {
      const hit = await this.prisma.llmCache.findUnique({ where: { cacheKey } });
      if (hit) {
        const parsed = opts.schema.safeParse(hit.response);
        if (parsed.success) {
          return { data: parsed.data, promptVersion, model: this.model, cached: true, cacheKey };
        }
        // Schema drifted since this entry was written — drop it and re-run.
        await this.prisma.llmCache.delete({ where: { cacheKey } }).catch(() => undefined);
      }
    }

    let data: T;
    try {
      data = await this.invokeModel(systemPrompt, opts.userContent, opts.schema, opts.maxTokens ?? 16000);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(
        `${this.providerName} call failed (${opts.promptName}): ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        `AI analysis is temporarily unavailable: ${(err as Error).message}`,
      );
    }

    await this.prisma.llmCache
      .upsert({
        where: { cacheKey },
        create: {
          cacheKey,
          promptName: opts.promptName,
          promptVersion,
          model: this.model,
          response: data as object,
          candidateId: opts.candidateId ?? null,
        },
        update: { response: data as object, candidateId: opts.candidateId ?? undefined },
      })
      .catch((err) => this.logger.warn(`LLM cache write failed: ${err.message}`));

    return { data, promptVersion, model: this.model, cached: false, cacheKey };
  }

  /**
   * Link an existing cache row to a candidate after the fact (used when the
   * candidate row is created only after their CV was parsed).
   */
  async tagCacheWithCandidate(cacheKey: string, candidateId: string): Promise<void> {
    await this.prisma.llmCache
      .updateMany({ where: { cacheKey }, data: { candidateId } })
      .catch((err) => this.logger.warn(`LLM cache tag failed: ${err.message}`));
  }
}
