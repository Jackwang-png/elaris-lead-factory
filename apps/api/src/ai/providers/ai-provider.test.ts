/**
 * P0-5B.1 — AI Provider abstraction + Structured Output test suite.
 *
 * Pure unit tests: every provider call goes through an in-memory fake
 * OpenAI client — NO network, NO real credentials, NO production API keys,
 * NO database (requirement: unit tests use mocks; never test against real
 * tenants or real providers).
 *
 * Run: npx ts-node src/ai/providers/ai-provider.test.ts
 */
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NestFactory } from '@nestjs/core';

import { AIError, AIErrorCode } from './ai-provider.errors';
import { AIChatRequest, AIJSONSchema, AIResult } from './ai-provider.types';
import { AiProviderRegistry } from './ai-provider.registry';
import { loadAIConfig } from './ai-provider.config';
import { AiProvidersModule } from './ai-providers.module';
import {
  OpenAICompatProvider,
  OpenAICompatProviderConfig,
  OpenAIClientLike,
} from './openai-compat.provider';
import { NullAIProvider, UnknownAIProvider } from './null.provider';
import {
  tryParseJson,
  validateJsonAgainstSchema,
} from './ai-json-schema.validator';

/* ------------------------------------------------------------------ */
/* Fakes                                                               */
/* ------------------------------------------------------------------ */

const INTENT_SCHEMA: AIJSONSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'confidence', 'keywords'],
  properties: {
    intent: { type: 'string', enum: ['price_inquiry', 'purchase_intent', 'unknown'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    keywords: { type: 'array', items: { type: 'string' } },
  },
};

type CreateHandler = (
  body: Record<string, unknown>,
  options?: { timeout?: number },
) => Promise<unknown>;

function makeFakeClient(handler: CreateHandler): OpenAIClientLike {
  return {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>, options?: { timeout?: number }) =>
          (await handler(body, options)) as never,
      },
    },
    embeddings: {
      create: async (body: Record<string, unknown>, options?: { timeout?: number }) =>
        (await handler(body, options)) as never,
    },
  };
}

function completion(content: string, over: Record<string, unknown> = {}) {
  return {
    model: 'deepseek-chat',
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    ...over,
  };
}

function providerConfig(
  over: Partial<OpenAICompatProviderConfig> = {},
): OpenAICompatProviderConfig {
  return {
    name: 'openai',
    defaultModel: 'gpt-3.5-turbo',
    embeddingModel: 'text-embedding-ada-002',
    timeoutMs: 60000,
    jsonResponseFormat: true,
    ...over,
  };
}

const baseRequest: AIChatRequest = {
  messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
};

function buildRegistry(
  over: Partial<OpenAICompatProviderConfig> = {},
  client?: OpenAIClientLike,
): AiProviderRegistry {
  const config = loadAIConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
  });
  const registry = new AiProviderRegistry(config, {
    nullProvider: new NullAIProvider(),
    unknownProvider: new UnknownAIProvider(),
  });
  registry.register(new OpenAICompatProvider(providerConfig({ ...over, client })));
  registry.register(
    new OpenAICompatProvider({
      name: 'deepseek',
      defaultModel: 'deepseek-chat',
      embeddingModel: 'text-embedding-ada-002',
      timeoutMs: 60000,
      jsonResponseFormat: true,
      apiKey: 'test-deepseek-key',
      baseURL: 'https://api.deepseek.com/v1',
      client,
    }),
  );
  return registry;
}

/* ------------------------------------------------------------------ */
/* Registry (exists / missing / unsupported / default resolution)      */
/* ------------------------------------------------------------------ */

test('registry: get() resolves registered providers by key', () => {
  const registry = buildRegistry();
  assert.ok(registry.has('openai'));
  assert.ok(registry.has('deepseek'));
  assert.deepEqual(registry.getRegistered().sort(), ['deepseek', 'openai']);
  assert.equal(registry.get('openai').name, 'openai');
  assert.equal(registry.get('deepseek').name, 'deepseek');
});

test('registry: get() falls back to UnknownAIProvider for missing keys', () => {
  const registry = buildRegistry();
  const missing = registry.get('does-not-exist');
  assert.ok(missing instanceof UnknownAIProvider);
  assert.equal(missing.name, 'unknown');
  assert.equal(registry.has('does-not-exist'), false);
});

test('registry: getDefault() resolves the configured default provider', () => {
  const registry = buildRegistry();
  // loadAIConfig default = 'openai' when DEEPSEEK_API_KEY is unset.
  assert.equal(registry.getDefaultName(), 'openai');
  assert.equal(registry.getDefault().name, 'openai');
});

test('registry: unsupported provider operations fail explicitly (fail-closed, no fake data)', async () => {
  const registry = buildRegistry();
  const unknown = registry.get('nope');
  await assert.rejects(
    () => unknown.chat(baseRequest),
    (err: unknown) => {
      assert.ok(err instanceof AIError);
      assert.equal((err as AIError).code, AIErrorCode.AI_PROVIDER_NOT_AVAILABLE);
      return true;
    },
  );
});

/* ------------------------------------------------------------------ */
/* AIConfig resolution                                                 */
/* ------------------------------------------------------------------ */

test('config: default provider heuristics (AI_PROVIDER / DEEPSEEK_API_KEY)', () => {
  assert.equal(loadAIConfig({}).defaultProviderName, 'openai');
  assert.equal(
    loadAIConfig({ DEEPSEEK_API_KEY: 'k' }).defaultProviderName,
    'deepseek',
  );
  assert.equal(
    loadAIConfig({ DEEPSEEK_API_KEY: 'k', AI_PROVIDER: 'openai' }).defaultProviderName,
    'openai',
  );
  assert.equal(
    loadAIConfig({ AI_PROVIDER: 'deepseek' }).defaultProviderName,
    'deepseek',
  );
});

test('config: defaults preserve baseline models; env overrides win', () => {
  const cfg = loadAIConfig({});
  assert.equal(cfg.openai.defaultModel, 'gpt-3.5-turbo'); // baseline intent default
  assert.equal(cfg.deepseek.defaultModel, 'deepseek-chat'); // prod bot.model default
  assert.equal(cfg.openai.embeddingModel, 'text-embedding-ada-002');
  assert.equal(cfg.timeoutMs, 60000);
  const cfg2 = loadAIConfig({ AI_OPENAI_MODEL: 'gpt-4o', AI_DEFAULT_MODEL: 'deepseek-chat', AI_TIMEOUT_MS: '30000' });
  assert.equal(cfg2.openai.defaultModel, 'gpt-4o');
  assert.equal(cfg2.defaultModel, 'deepseek-chat');
  assert.equal(cfg2.timeoutMs, 30000);
});

/* ------------------------------------------------------------------ */
/* OpenAI adapter: chat success / timeout / 401 / 429 / 500            */
/* ------------------------------------------------------------------ */

test('adapter: chat success returns content, provider, model and normalized usage', async () => {
  const fake = makeFakeClient(async (body) => completion('你好，有什么可以帮您？'));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const result = await provider.chat({ ...baseRequest, promptVersion: 'lead-intent:v1' });
  assert.equal(result.success, true);
  assert.equal(result.data, '你好，有什么可以帮您？');
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'deepseek-chat'); // from provider response
  assert.deepEqual(result.usage, {
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
  });
  assert.equal(result.promptVersion, 'lead-intent:v1');
});

test('adapter: chat timeout maps to AI_TIMEOUT (SDK ETIMEDOUT)', async () => {
  const fake = makeFakeClient(async () => {
    const e: any = new Error('connect ETIMEDOUT 1.2.3.4:443');
    e.code = 'ETIMEDOUT';
    throw e;
  });
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  await assert.rejects(
    () => provider.chat(baseRequest),
    (err: unknown) => {
      assert.ok(err instanceof AIError);
      assert.equal((err as AIError).code, AIErrorCode.AI_TIMEOUT);
      return true;
    },
  );
});

test('adapter: chat abort (AbortError) maps to AI_TIMEOUT', async () => {
  const fake = makeFakeClient(async () => {
    throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
  });
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  await assert.rejects(
    () => provider.chat(baseRequest),
    (err: unknown) => {
      assert.equal((err as AIError).code, AIErrorCode.AI_TIMEOUT);
      return true;
    },
  );
});

test('adapter: 401 and 403 map to AI_AUTH_ERROR', async () => {
  for (const status of [401, 403]) {
    const fake = makeFakeClient(async () => {
      throw Object.assign(new Error(`HTTP ${status} Invalid API key`), { status });
    });
    const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
    await assert.rejects(
      () => provider.chat(baseRequest),
      (err: unknown) => {
        assert.ok(err instanceof AIError);
        assert.equal((err as AIError).code, AIErrorCode.AI_AUTH_ERROR);
        return true;
      },
    );
  }
});

test('adapter: 429 maps to AI_RATE_LIMITED', async () => {
  const fake = makeFakeClient(async () => {
    throw Object.assign(new Error('HTTP 429 Rate limit'), { status: 429 });
  });
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  await assert.rejects(
    () => provider.chat(baseRequest),
    (err: unknown) => {
      assert.equal((err as AIError).code, AIErrorCode.AI_RATE_LIMITED);
      return true;
    },
  );
});

test('adapter: 5xx maps to AI_PROVIDER_ERROR', async () => {
  const fake = makeFakeClient(async () => {
    throw Object.assign(new Error('HTTP 500 Internal'), { status: 500 });
  });
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  await assert.rejects(
    () => provider.chat(baseRequest),
    (err: unknown) => {
      assert.equal((err as AIError).code, AIErrorCode.AI_PROVIDER_ERROR);
      return true;
    },
  );
});

test('adapter: missing API key degrades to AI_CONFIGURATION_ERROR at call time', async () => {
  const provider = new OpenAICompatProvider(providerConfig({ apiKey: undefined }));
  await assert.rejects(
    () => provider.chat(baseRequest),
    (err: unknown) => {
      assert.ok(err instanceof AIError);
      assert.equal((err as AIError).code, AIErrorCode.AI_CONFIGURATION_ERROR);
      return true;
    },
  );
});

test('adapter: timeout option is passed to every SDK call', async () => {
  let seenTimeout: number | undefined;
  const fake = makeFakeClient(async (_body, _opts) => {
    seenTimeout = (_opts as { timeout?: number })?.timeout;
    return completion('ok');
  });
  const provider = new OpenAICompatProvider(providerConfig({ client: fake, timeoutMs: 12345 }));
  await provider.chat({ ...baseRequest, timeoutMs: 9999 });
  assert.equal(seenTimeout, 9999);
  await provider.chat(baseRequest); // request without override → provider default
  assert.equal(seenTimeout, 12345);
});

/* ------------------------------------------------------------------ */
/* Usage normalization                                                 */
/* ------------------------------------------------------------------ */

test('usage: full usage mapped to promptTokens/completionTokens/totalTokens', () => {
  const fake = makeFakeClient(async () =>
    completion('{}', { usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 } }),
  );
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  return provider.chat(baseRequest).then((r) => {
    assert.deepEqual(r.usage, { promptTokens: 11, completionTokens: 22, totalTokens: 33 });
  });
});

test('usage: provider without usage → usageUnavailable=true, no fake zeros', async () => {
  const fake = makeFakeClient(async () => completion('ok', { usage: null }));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.chat(baseRequest);
  assert.equal(r.usage?.usageUnavailable, true);
  assert.equal(r.usage?.promptTokens, undefined);
  assert.equal(r.usage?.totalTokens, undefined);
});

test('usage: partial usage keeps only present fields (embeddings: prompt only)', async () => {
  const fake = makeFakeClient(async (body) => {
    if (body.model === 'text-embedding-ada-002') {
      return { data: [{ embedding: [0.1, 0.2] }], usage: { prompt_tokens: 7 } };
    }
    return completion('ok');
  });
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.embed({ input: 'text' });
  assert.deepEqual(r.usage, { promptTokens: 7 });
});

/* ------------------------------------------------------------------ */
/* Structured output: valid / invalid / missing / wrong type /         */
/* wrong enum / extra field (fail-closed)                              */
/* ------------------------------------------------------------------ */

const VALID_JSON = '{"intent":"price_inquiry","confidence":0.85,"keywords":["价格"]}';

test('structured: valid JSON passes schema → success with parsed data', async () => {
  const fake = makeFakeClient(async () => completion(VALID_JSON));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.generateStructured<{
    intent: string;
    confidence: number;
    keywords: string[];
  }>({
    ...baseRequest,
    responseSchema: INTENT_SCHEMA,
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.intent, 'price_inquiry');
  assert.equal(r.data?.confidence, 0.85);
  assert.equal(r.provider, 'openai');
});

test('structured: invalid JSON → FAILED (AI_INVALID_OUTPUT), data undefined', async () => {
  const fake = makeFakeClient(async () => completion('this is not json {'));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.generateStructured({ ...baseRequest, responseSchema: INTENT_SCHEMA });
  assert.equal(r.success, false);
  assert.equal(r.data, undefined); // fail-closed: no partial data
  assert.equal(r.error?.code, AIErrorCode.AI_INVALID_OUTPUT);
});

test('structured: missing required field → FAILED, data undefined', async () => {
  const fake = makeFakeClient(async () =>
    completion('{"intent":"price_inquiry","confidence":0.85}'), // no keywords
  );
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.generateStructured({ ...baseRequest, responseSchema: INTENT_SCHEMA });
  assert.equal(r.success, false);
  assert.equal(r.data, undefined);
  assert.match(r.error?.message || '', /missing required field/);
});

test('structured: wrong type → FAILED', async () => {
  const fake = makeFakeClient(async () =>
    completion('{"intent":"price_inquiry","confidence":"high","keywords":["价格"]}'),
  );
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.generateStructured({ ...baseRequest, responseSchema: INTENT_SCHEMA });
  assert.equal(r.success, false);
  assert.equal(r.data, undefined);
  assert.match(r.error?.message || '', /expected number/);
});

test('structured: wrong enum → FAILED', async () => {
  const fake = makeFakeClient(async () =>
    completion('{"intent":"not_a_real_intent","confidence":0.8,"keywords":[]}'),
  );
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.generateStructured({ ...baseRequest, responseSchema: INTENT_SCHEMA });
  assert.equal(r.success, false);
  assert.equal(r.data, undefined);
  assert.match(r.error?.message || '', /not in enum/);
});

test('structured: extra field rejected when additionalProperties=false', async () => {
  const fake = makeFakeClient(async () =>
    completion('{"intent":"price_inquiry","confidence":0.8,"keywords":[],"evil":"inject"}'),
  );
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.generateStructured({ ...baseRequest, responseSchema: INTENT_SCHEMA });
  assert.equal(r.success, false);
  assert.equal(r.data, undefined);
  assert.match(r.error?.message || '', /unexpected extra field/);
});

test('structured: empty content → FAILED (not valid JSON), no fallback', async () => {
  const fake = makeFakeClient(async () => completion(''));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.generateStructured({ ...baseRequest, responseSchema: INTENT_SCHEMA });
  assert.equal(r.success, false);
  assert.equal(r.data, undefined);
  assert.equal(r.error?.code, AIErrorCode.AI_INVALID_OUTPUT);
});

test('structured: responseSchema required (configuration error otherwise)', async () => {
  const fake = makeFakeClient(async () => completion(VALID_JSON));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  await assert.rejects(
    () => provider.generateStructured(baseRequest),
    (err: unknown) => {
      assert.ok(err instanceof AIError);
      assert.equal((err as AIError).code, AIErrorCode.AI_CONFIGURATION_ERROR);
      return true;
    },
  );
});

test('structured: response_format json_object rejected (400) → retried once without hint', async () => {
  let calls = 0;
  const fake = makeFakeClient(async (body) => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('HTTP 400 response_format not supported'), { status: 400 });
    assert.equal(body.response_format, undefined); // retry dropped the hint
    return completion(VALID_JSON);
  });
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.generateStructured<{ intent: string }>({
    ...baseRequest,
    responseSchema: INTENT_SCHEMA,
  });
  assert.equal(r.success, true);
  assert.equal(r.data?.intent, 'price_inquiry');
  assert.equal(calls, 2);
});

test('structured: persistent 400 → normalized provider error (no unverified acceptance)', async () => {
  const fake = makeFakeClient(async () => {
    throw Object.assign(new Error('HTTP 400 bad'), { status: 400 });
  });
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  await assert.rejects(
    () => provider.generateStructured({ ...baseRequest, responseSchema: INTENT_SCHEMA }),
    (err: unknown) => {
      assert.ok(err instanceof AIError);
      assert.equal((err as AIError).code, AIErrorCode.AI_PROVIDER_ERROR);
      return true;
    },
  );
});

/* ------------------------------------------------------------------ */
/* Prompt version                                                      */
/* ------------------------------------------------------------------ */

test('prompt version: carried through chat and structured results', async () => {
  const fake = makeFakeClient(async () => completion(VALID_JSON));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const chatResult = await provider.chat({ ...baseRequest, promptVersion: 'chat-reply:v1' });
  assert.equal(chatResult.promptVersion, 'chat-reply:v1');
  const structResult = await provider.generateStructured({
    ...baseRequest,
    responseSchema: INTENT_SCHEMA,
    promptVersion: 'lead-intent:v1',
  });
  assert.equal(structResult.promptVersion, 'lead-intent:v1');
});

test('request id: metadata.requestId surfaced on AIResult', async () => {
  const fake = makeFakeClient(async () => completion('ok'));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.chat({
    ...baseRequest,
    metadata: { requestId: 'req-123', purpose: 'test' },
  });
  assert.equal(r.requestId, 'req-123');
});

/* ------------------------------------------------------------------ */
/* Tenant isolation (provider layer cannot override tenant)            */
/* ------------------------------------------------------------------ */

test('tenant: metadata.tenantId never influences provider resolution', async () => {
  const registry = buildRegistry();
  const pA = registry.getDefault();
  // Same provider instance regardless of request metadata tenant.
  const pB = registry.getDefault();
  assert.equal(pA, pB);

  const fake = makeFakeClient(async () => completion('ok'));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r1 = await provider.chat({ ...baseRequest, metadata: { tenantId: 'tenant-A' } });
  const r2 = await provider.chat({ ...baseRequest, metadata: { tenantId: 'tenant-B' } });
  assert.equal(r1.provider, r2.provider);
  assert.equal(r1.model, r2.model);
});

test('tenant: provider layer has no tenant/database surface', () => {
  const registry = buildRegistry();
  const provider = registry.getDefault();
  // Infra layer: no tenant lookup methods, no DB access — the adapter only
  // exposes chat/generateStructured/embed/capabilities.
  const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(provider)).sort();
  assert.ok(surface.includes('chat'));
  assert.ok(surface.includes('generateStructured'));
  assert.ok(surface.includes('embed'));
  assert.ok(surface.includes('capabilities'));
  assert.ok(!surface.some((m) => /tenant|findFirst|prisma/i.test(m)));
});

test('tenant: metadata is never promoted into the prompt', async () => {
  let seenMessages: unknown;
  const fake = makeFakeClient(async (body) => {
    seenMessages = body.messages;
    return completion(VALID_JSON);
  });
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  await provider.generateStructured({
    ...baseRequest,
    responseSchema: INTENT_SCHEMA,
    metadata: { tenantId: 'tenant-A', leadId: 'lead-1', purpose: 'intent' },
  });
  const messages = seenMessages as Array<{ role: string; content: string }>;
  assert.equal(messages.length, 2); // only system + user, unchanged
  assert.ok(!JSON.stringify(messages).includes('tenant-A'));
  assert.ok(!JSON.stringify(messages).includes('lead-1'));
});

/* ------------------------------------------------------------------ */
/* Validator primitives                                                */
/* ------------------------------------------------------------------ */

test('validator: tryParseJson strict (no silent partial)', () => {
  assert.deepEqual(tryParseJson('{"a":1}'), { a: 1 });
  assert.equal(tryParseJson(''), undefined);
  assert.equal(tryParseJson('not json'), undefined);
  assert.equal(tryParseJson('{"a":}'), undefined);
});

test('validator: schema checks (enum/type/required/additionalProperties)', () => {
  assert.deepEqual(validateJsonAgainstSchema({ a: 1 }, { type: 'object' }), []);
  assert.deepEqual(
    validateJsonAgainstSchema({ a: 1 }, { type: 'object', additionalProperties: false, properties: {} }),
    ['$.a: unexpected extra field'],
  );
  assert.deepEqual(
    validateJsonAgainstSchema(1, { type: 'object' }),
    ['$: expected object, got number'],
  );
  assert.deepEqual(
    validateJsonAgainstSchema([1, 'x'], { type: 'array', items: { type: 'number' } }),
    ['$[1]: expected number, got string'],
  );
  assert.deepEqual(validateJsonAgainstSchema(null, { type: 'object' }), ['$: null is not allowed']);
});

/* ------------------------------------------------------------------ */
/* Embed                                                               */
/* ------------------------------------------------------------------ */

test('embed: success returns normalized vector + prompt-only usage', async () => {
  const fake = makeFakeClient(async () => ({
    data: [{ embedding: [0.1, 0.2, 0.3] }],
    usage: { prompt_tokens: 7 },
  }));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  const r = await provider.embed({ input: '知识库内容' });
  assert.equal(r.success, true);
  assert.deepEqual(r.data, [0.1, 0.2, 0.3]);
  assert.equal(r.model, 'text-embedding-ada-002'); // provider default embedding model
});

test('embed: provider returns no vector → AI_PROVIDER_ERROR (no zero-vector fabrication in adapter)', async () => {
  const fake = makeFakeClient(async () => ({ data: [], usage: { prompt_tokens: 1 } }));
  const provider = new OpenAICompatProvider(providerConfig({ client: fake }));
  await assert.rejects(
    () => provider.embed({ input: 'x' }),
    (err: unknown) => {
      assert.ok(err instanceof AIError);
      assert.equal((err as AIError).code, AIErrorCode.AI_PROVIDER_ERROR);
      return true;
    },
  );
});

/* ------------------------------------------------------------------ */
/* Nest DI wiring                                                      */
/* ------------------------------------------------------------------ */

/**
 * DI wiring test: boots AiProvidersModule in a Nest application context
 * with EVERY env key the module reads overridden by fake values, so no
 * real .env / production credential is ever touched and no network call
 * happens (provider construction only). process.env is restored after.
 */
test('DI: AiProvidersModule wires registry with openai + deepseek adapters', async () => {
  const FAKE_ENV: Record<string, string> = {
    AI_PROVIDER: 'deepseek',
    AI_DEFAULT_MODEL: 'test-model',
    AI_TIMEOUT_MS: '60000',
    AI_OPENAI_MODEL: 'test-openai-model',
    AI_DEEPSEEK_MODEL: 'test-deepseek-model',
    AI_EMBEDDING_MODEL: 'test-embedding-model',
    AI_JSON_RESPONSE_FORMAT: 'true',
    OPENAI_API_KEY: 'test-openai-key',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
  };
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(FAKE_ENV)) {
    saved[key] = process.env[key];
    process.env[key] = FAKE_ENV[key];
  }
  try {
    const app = await NestFactory.createApplicationContext(AiProvidersModule, {
      logger: false,
    });
    try {
      const registry = app.get(AiProviderRegistry);
      assert.ok(registry instanceof AiProviderRegistry);
      assert.deepEqual(registry.getRegistered().sort(), ['deepseek', 'openai']);
      assert.equal(registry.getDefaultName(), 'deepseek');
      assert.equal(registry.getDefault().name, 'deepseek');
    } finally {
      await app.close();
    }
  } finally {
    for (const key of Object.keys(FAKE_ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
