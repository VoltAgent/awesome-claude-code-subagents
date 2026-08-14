#!/usr/bin/env node
/**
 * Claude Flow CLI - Umbrella entry point
 * Proxies to @claude-flow/cli bin for cross-platform compatibility.
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'v3', '@claude-flow', 'cli', 'bin', 'cli.js');
await import(pathToFileURL(cliPath).href);
