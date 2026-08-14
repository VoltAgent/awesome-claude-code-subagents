/**
 * PostgreSQL security utilities for RuVector commands.
 * Prevents SQL injection via identifier interpolation.
 *
 * @module v3/cli/commands/ruvector/pg-utils
 */

/**
 * Valid PostgreSQL identifier pattern.
 * Allows only ASCII letters, digits, and underscores.
 * Must start with a letter or underscore.
 */
const VALID_PG_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate a PostgreSQL schema name.
 * Throws if the name contains characters that could enable SQL injection.
 * Safe names are returned as-is (no quoting needed since they match the identifier pattern).
 */
export function validateSchemaName(schema: string): string {
  if (!schema || schema.length === 0) {
    throw new Error('Schema name must not be empty');
  }
  if (schema.length > 63) {
    throw new Error(`Schema name too long (${schema.length} chars, max 63): "${schema}"`);
  }
  if (!VALID_PG_IDENTIFIER.test(schema)) {
    throw new Error(
      `Invalid schema name: "${schema}". Must contain only letters, digits, and underscores, and start with a letter or underscore.`
    );
  }
  return schema;
}

/**
 * Validate a PostgreSQL timestamp string.
 * Only allows ISO 8601 format to prevent SQL injection via timestamp fields.
 */
const VALID_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

export function validateTimestamp(value: string): string {
  if (!VALID_TIMESTAMP.test(value)) {
    throw new Error(`Invalid timestamp format: "${value}". Expected ISO 8601.`);
  }
  return value;
}
