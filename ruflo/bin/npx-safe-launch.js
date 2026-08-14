#!/usr/bin/env node
// Safe NPX launcher — no-op wrapper (cache repair removed in 3.1.0-alpha.53)
// Proxies directly to the CLI entry point.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'v3', '@claude-flow', 'cli', 'bin', 'cli.js');
await import(pathToFileURL(cliPath).href);
