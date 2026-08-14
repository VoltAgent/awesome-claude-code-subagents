import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import {
  loadLoopState,
  requestLoopStop,
  resolveLoopPaths,
  runCodexLoop,
  type LoopState,
} from './index.js';

export function createLoopCommand(): Command {
  const loop = new Command('loop')
    .description('Run Codex in a bounded /loop-compatible iteration cycle');

  loop
    .command('run')
    .description('Start a Codex loop')
    .argument('[prompt...]', 'Prompt for Codex. Omit when using --command.')
    .option('-n, --name <name>', 'Loop name', 'default')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .option('-i, --interval <seconds>', 'Seconds between iterations', '270')
    .option('-m, --max-iterations <count>', 'Maximum iterations; 0 means unbounded', '10')
    .option('--timeout <ms>', 'Per-iteration timeout in milliseconds', '1800000')
    .option('--until-file <path>', 'Stop when this file exists. Defaults to .codex/loop/<name>.complete')
    .option('--command <command>', 'Run a shell command each iteration instead of codex exec')
    .option('--codex-command <command>', 'Codex executable', 'codex')
    .option('--model <model>', 'Model passed to codex exec')
    .option('--sandbox <mode>', 'Sandbox passed to codex exec', 'workspace-write')
    .option('--no-skip-git-repo-check', 'Do not pass --skip-git-repo-check to codex exec')
    .option('--dry-run', 'Write planned state and print what would run without executing')
    .action(async (promptParts: string[], options) => {
      try {
        const prompt = promptParts.join(' ').trim();
        const state = await runCodexLoop({
          name: options.name,
          projectPath: options.path,
          prompt,
          command: options.command,
          codexCommand: options.codexCommand,
          model: options.model,
          sandbox: options.sandbox,
          skipGitRepoCheck: options.skipGitRepoCheck,
          intervalSeconds: parseInteger(options.interval, 270),
          maxIterations: parseInteger(options.maxIterations, 10),
          timeoutMs: parseInteger(options.timeout, 1_800_000),
          untilFile: options.untilFile,
          dryRun: options.dryRun,
          onEvent: event => {
            if (event.type === 'iteration-start') {
              console.log(chalk.cyan(`iteration ${event.state.iteration} starting`));
            } else if (event.type === 'iteration-complete') {
              console.log(chalk.gray(event.message ?? `iteration ${event.state.iteration} complete`));
            } else if (event.type === 'sleep') {
              console.log(chalk.gray(event.message));
            } else if (event.type === 'error') {
              console.log(chalk.red(event.message));
            }
          },
        });

        printState(state);
        if (state.status === 'failed') process.exitCode = 1;
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  loop
    .command('status')
    .description('Show loop state')
    .option('-n, --name <name>', 'Loop name', 'default')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .option('--json', 'Print raw JSON state')
    .action(async (options) => {
      const projectPath = path.resolve(options.path);
      const state = await loadLoopState(projectPath, options.name);
      if (!state) {
        const paths = resolveLoopPaths(projectPath, options.name);
        console.log(chalk.yellow(`No loop state found at ${paths.statePath}`));
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(state, null, 2));
        return;
      }
      printState(state);
    });

  loop
    .command('stop')
    .description('Request a running loop to stop after the current iteration')
    .option('-n, --name <name>', 'Loop name', 'default')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action(async (options) => {
      const projectPath = path.resolve(options.path);
      const paths = await requestLoopStop(projectPath, options.name);
      console.log(chalk.green(`Stop requested: ${paths.stopPath}`));
    });

  return loop;
}

function printState(state: LoopState): void {
  const color = state.status === 'failed'
    ? chalk.red
    : state.status === 'running'
      ? chalk.cyan
      : chalk.green;

  console.log(color(`Loop ${state.name}: ${state.status}`));
  console.log(chalk.gray(`  mode:       ${state.mode}`));
  console.log(chalk.gray(`  iteration:  ${state.iteration}/${state.maxIterations === 0 ? 'unbounded' : state.maxIterations}`));
  console.log(chalk.gray(`  interval:   ${state.intervalSeconds}s`));
  console.log(chalk.gray(`  until file: ${state.untilFile}`));
  if (state.lastExitCode !== undefined) {
    console.log(chalk.gray(`  last exit:  ${state.lastExitCode}`));
  }
  if (state.lastError) {
    console.log(chalk.red(`  last error: ${state.lastError.split('\n')[0]}`));
  }
}

function parseInteger(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number') return value;
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
