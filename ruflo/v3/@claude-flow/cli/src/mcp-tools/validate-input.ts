/**
 * Input Validation for MCP Tools — re-export shim (ADR-100, alpha.5).
 *
 * Authoritative source: @claude-flow/cli-core/mcp-tools/validate-input.
 * Was a 256-line byte-identical copy. Loads @claude-flow/security validators
 * when available, with lightweight fallback otherwise.
 */

export * from '@claude-flow/cli-core/mcp-tools/validate-input';
