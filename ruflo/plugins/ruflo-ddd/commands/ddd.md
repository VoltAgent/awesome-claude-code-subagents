---
name: ddd
description: Domain-Driven Design scaffolding and boundary enforcement
---
$ARGUMENTS

Route DDD commands based on the subcommand:

## Subcommands

### `ddd context create <name>`
Scaffold a new bounded context directory structure. Invoke the `/ddd-context` skill with the context name.

### `ddd context list`
List all bounded contexts by scanning `src/*/domain/` directories:
```bash
find src -maxdepth 2 -name "domain" -type d | sed 's|src/||;s|/domain||'
```

### `ddd aggregate <context> <name>`
Generate an aggregate root with entity, value objects, repository interface, domain events, and unit test stubs. Invoke the `/ddd-aggregate` skill with `<context> <name>`.

### `ddd event <context> <name>`
Create a domain event class in the target context:
- File: `src/<context>/domain/events/<name>.event.ts`
- Include: event name (past tense), timestamp, payload interface, static factory method
- Register the event in the context's event index

### `ddd validate`
Check domain boundary violations. Invoke the `/ddd-validate` skill.

### `ddd map`
Visualize the context map with relationships:
1. Scan all bounded contexts under `src/`
2. Analyze imports to detect inter-context dependencies
3. Output a context map showing:
   - Each bounded context and its aggregates
   - Relationships: upstream/downstream, ACL, shared kernel, published language
   - Boundary violations (direct imports instead of events/ACL)

## Parsing

Parse `$ARGUMENTS` to extract the subcommand and its arguments. If no arguments are provided, show the help text listing all subcommands.
