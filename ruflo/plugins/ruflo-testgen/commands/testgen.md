---
name: testgen
description: Generate tests for a file or module using coverage analysis and TDD patterns
---
$ARGUMENTS

Generate tests by analyzing coverage gaps and applying TDD London School patterns.

1. **Analyze gaps**: `npx @claude-flow/cli@latest hooks coverage-gaps --format table`
2. **Route for coverage**: `npx @claude-flow/cli@latest hooks coverage-route --task "$ARGUMENTS"`
3. **Suggest tests**: `npx @claude-flow/cli@latest hooks coverage-suggest --path "$ARGUMENTS"`

Parse $ARGUMENTS as a file path or module name. Generate tests following these conventions:
- Place tests adjacent to source: `src/foo.ts` -> `src/foo.test.ts`
- Use `describe`/`it` blocks with descriptive names
- Mock external dependencies
- Cover happy path, edge cases, and error paths

If no arguments, run coverage-gaps to show what needs tests.
