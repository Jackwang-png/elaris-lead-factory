import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRATION: Joi.string().default('7d'),
  OPENAI_API_KEY: Joi.string().required(),
  OPENAI_BASE_URL: Joi.string().optional(),
  // P0-5B.1 — AI provider abstraction (all optional, safe defaults in code)
  AI_PROVIDER: Joi.string().optional(),
  AI_DEFAULT_MODEL: Joi.string().optional(),
  AI_TIMEOUT_MS: Joi.string().optional(),
  AI_OPENAI_MODEL: Joi.string().optional(),
  AI_DEEPSEEK_MODEL: Joi.string().optional(),
  AI_EMBEDDING_MODEL: Joi.string().optional(),
  AI_JSON_RESPONSE_FORMAT: Joi.string().optional(),
  DEEPSEEK_API_KEY: Joi.string().optional(),
  DEEPSEEK_BASE_URL: Joi.string().optional(),
});
