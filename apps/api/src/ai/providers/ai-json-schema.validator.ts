/**
 * P0-5B.1 — Minimal JSON Schema validator (fail-closed structured output).
 *
 * Rationale (requirement 7): no zod/AJV/class-validator-based schema exists
 * for validating free-form LLM JSON against a *dynamic* shape. class-validator
 * validates decorated classes (not raw LLM output), and the project's other
 * validator (joi) is used for env config. Introducing AJV/zod would add a new
 * runtime dependency for a ~120-line subset. This validator implements the
 * JSON Schema subset that the AI layer actually needs (type/required/
 * properties/items/enum/additionalProperties/min-max) and keeps the OpenAI
 * JSON Schema as the single contract — zero new dependencies.
 *
 * Fail-closed semantics: any error → the output is rejected (AI_INVALID_OUTPUT).
 * Extra properties are rejected only when the schema sets
 * `additionalProperties: false`.
 */
import { AIJSONSchema } from './ai-provider.types';

export type SchemaValidationError = string;

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function validateValue(
  value: unknown,
  schema: AIJSONSchema,
  path: string,
  errors: SchemaValidationError[],
): void {
  if (value === null) {
    errors.push(`${path}: null is not allowed`);
    return;
  }

  const t = schema.type;
  if (t) {
    if (t === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push(`${path}: expected integer, got ${typeName(value)}`);
        return;
      }
    } else if (t === 'array') {
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeName(value)}`);
        return;
      }
    } else if (t === 'object') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path}: expected object, got ${typeName(value)}`);
        return;
      }
    } else if (typeof value !== t) {
      errors.push(`${path}: expected ${t}, got ${typeName(value)}`);
      return;
    }
  }

  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return;
      const obj = value as Record<string, unknown>;
      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in obj)) {
            errors.push(`${path}.${key}: missing required field`);
          }
        }
      }
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in obj) {
            validateValue(obj[key], propSchema, `${path}.${key}`, errors);
          }
        }
      }
      if (schema.additionalProperties === false && schema.properties) {
        for (const key of Object.keys(obj)) {
          if (!(key in schema.properties)) {
            errors.push(`${path}.${key}: unexpected extra field`);
          }
        }
      }
      break;
    }
    case 'array': {
      if (!Array.isArray(value)) return;
      if (schema.items) {
        value.forEach((item, i) =>
          validateValue(item, schema.items as AIJSONSchema, `${path}[${i}]`, errors),
        );
      }
      break;
    }
    case 'string': {
      if (typeof value !== 'string') return;
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push(`${path}: shorter than minLength ${schema.minLength}`);
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
      }
      break;
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number') return;
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push(`${path}: below minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push(`${path}: above maximum ${schema.maximum}`);
      }
      break;
    }
    default:
      break;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value not in enum (${schema.enum.join(', ')})`);
  }
}

/**
 * Validate `value` against the schema subset. Returns a list of errors;
 * empty list = valid.
 */
export function validateJsonAgainstSchema(
  value: unknown,
  schema: AIJSONSchema,
): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  validateValue(value, schema, '$', errors);
  return errors;
}

/** Strict JSON.parse: returns undefined when the content is not valid JSON. */
export function tryParseJson(content: string): unknown | undefined {
  if (typeof content !== 'string' || content.trim() === '') return undefined;
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}
