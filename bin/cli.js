#!/usr/bin/env node

/**
 * Awesome ZCode Subagents CLI Installer
 * Zero-dependency installer for ZCode subagents on Windows, macOS, and Linux.
 * 
 * Usage:
 *   npx github:a2mus/awesome-zcode-subagents [options]
 *   node bin/cli.js [options]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Color helpers using ANSI escape codes (supported on modern Windows Terminal, PowerShell, CMD, Bash)
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

const c = {
  bold: (text) => `${colors.bold}${text}${colors.reset}`,
  green: (text) => `${colors.green}${text}${colors.reset}`,
  cyan: (text) => `${colors.cyan}${text}${colors.reset}`,
  yellow: (text) => `${colors.yellow}${text}${colors.reset}`,
  red: (text) => `${colors.red}${text}${colors.reset}`,
  dim: (text) => `${colors.dim}${text}${colors.reset}`,
  magenta: (text) => `${colors.magenta}${text}${colors.reset}`,
  blue: (text) => `${colors.blue}${text}${colors.reset}`
};

// Root directories
const CATEGORIES_DIR = path.resolve(__dirname, '..', 'categories');

// Default target directory: ~/.zcode/agents
function getDefaultTargetDir() {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(home, '.zcode', 'agents');
}

// Curated starter pack (10 essential development subagents)
const STARTER_PACK = [
  'fullstack-developer',
  'frontend-developer',
  'backend-developer',
  'typescript-pro',
  'python-pro',
  'docker-expert',
  'devops-engineer',
  'code-reviewer',
  'debugger',
  'agent-installer'
];

// Helper to scan all categories and subagents
function getCatalog() {
  if (!fs.existsSync(CATEGORIES_DIR)) {
    console.error(c.red(`Error: Categories directory not found at ${CATEGORIES_DIR}`));
    process.exit(1);
  }

  const entries = fs.readdirSync(CATEGORIES_DIR, { withFileTypes: true });
  const categories = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();

  const catalog = {};
  let totalAgents = 0;

  for (const cat of categories) {
    const catDir = path.join(CATEGORIES_DIR, cat);
    const files = fs.readdirSync(catDir, { withFileTypes: true });
    const agents = files
      .filter((f) => f.isFile() && f.name.endsWith('.md') && f.name.toLowerCase() !== 'readme.md')
      .map((f) => {
        const name = f.name.replace(/\.md$/, '');
        const filePath = path.join(catDir, f.name);
        return { name, file: f.name, path: filePath, category: cat };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    catalog[cat] = agents;
    totalAgents += agents.length;
  }

  return { categories, catalog, totalAgents };
}

// Find an agent by name across all categories
function findAgentByName(name, catalog) {
  const cleanName = name.replace(/\.md$/, '').toLowerCase();
  for (const cat of Object.keys(catalog)) {
    const match = catalog[cat].find((a) => a.name.toLowerCase() === cleanName);
    if (match) return match;
  }
  return null;
}

// Match category by prefix number or partial name
function findCategory(query, categories) {
  const q = query.toLowerCase();
  // Exact match
  let found = categories.find((c) => c.toLowerCase() === q);
  if (found) return found;

  // Number match e.g. "1" or "01"
  found = categories.find((c) => c.startsWith(q.padStart(2, '0')) || c.startsWith(q));
  if (found) return found;

  // Partial substring match
  found = categories.find((c) => c.toLowerCase().includes(q));
  return found || null;
}

// Copy an agent file to target directory
function installAgentFile(agent, targetDir, quiet = false) {
  fs.mkdirSync(targetDir, { recursive: true });
  const destPath = path.join(targetDir, `${agent.name}.md`);
  const isOverwriting = fs.existsSync(destPath);
  fs.copyFileSync(agent.path, destPath);
  if (!quiet) {
    const action = isOverwriting ? c.yellow('updated') : c.green('installed');
    console.log(`  ${c.cyan('•')} ${c.bold(agent.name)} (${agent.category}) ${action}`);
  }
  return isOverwriting ? 'updated' : 'installed';
}

// Print header banner
function printHeader(targetDir) {
  console.log();
  console.log(c.cyan('╔════════════════════════════════════════════════════════════════════════╗'));
  console.log(c.cyan('║') + c.bold('                    Awesome ZCode Subagents Installer                  ') + c.cyan('║'));
  console.log(c.cyan('╚════════════════════════════════════════════════════════════════════════╝'));
  console.log(`  ${c.dim('OS:')} ${process.platform} (${os.arch()})`);
  console.log(`  ${c.dim('Destination:')} ${c.cyan(targetDir)}`);
  console.log();
}

// Print usage help
function printHelp(targetDir) {
  printHeader(targetDir);
  console.log(`${c.bold('USAGE:')}`);
  console.log(`  npx github:a2mus/awesome-zcode-subagents [options]`);
  console.log(`  node bin/cli.js [options]`);
  console.log();
  console.log(`${c.bold('OPTIONS:')}`);
  console.log(`  ${c.cyan('-s, --starter')}           Install the recommended starter pack (10 essential agents)`);
  console.log(`  ${c.cyan('-a, --all')}               Install ALL 158+ subagents into your ZCode directory`);
  console.log(`  ${c.cyan('-c, --category <name>')}   Install all agents from a category (e.g. -c 01, -c infra)`);
  console.log(`  ${c.cyan('-g, --agent <names>')}     Install specific agent(s), comma-separated (e.g. -g python-pro,debugger)`);
  console.log(`  ${c.cyan('-l, --list')}              List all available categories and agents`);
  console.log(`  ${c.cyan('--installed')}             List subagents currently installed in target directory`);
  console.log(`  ${c.cyan('-u, --uninstall <name>')}  Uninstall an agent, or "all" to remove all`);
  console.log(`  ${c.cyan('-d, --dest <path>')}       Custom destination directory (default: ~/.zcode/agents)`);
  console.log(`  ${c.cyan('-h, --help')}              Show this help menu`);
  console.log();
  console.log(`${c.bold('EXAMPLES (Windows / macOS / Linux):')}`);
  console.log(`  npx github:a2mus/awesome-zcode-subagents --starter`);
  console.log(`  npx github:a2mus/awesome-zcode-subagents -c 02-language-specialists`);
  console.log(`  npx github:a2mus/awesome-zcode-subagents --agent code-reviewer,debugger`);
  console.log(`  npx github:a2mus/awesome-zcode-subagents --installed`);
  console.log();
}

// Print catalog listing
function printCatalog(catalogData) {
  console.log(c.bold(`Catalog: ${catalogData.totalAgents} Subagents across ${catalogData.categories.length} Categories\n`));
  for (const cat of catalogData.categories) {
    const agents = catalogData.catalog[cat];
    console.log(`${c.magenta(c.bold(cat))} ${c.dim(`(${agents.length} agents)`)}`);
    const agentNames = agents.map((a) => a.name).join(', ');
    console.log(`  ${c.dim(agentNames)}\n`);
  }
}

// List installed agents
function listInstalled(targetDir) {
  if (!fs.existsSync(targetDir)) {
    console.log(c.yellow(`Target directory does not exist yet: ${targetDir}`));
    console.log(`No subagents currently installed.`);
    return [];
  }

  const files = fs.readdirSync(targetDir)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .map((f) => f.replace(/\.md$/, ''))
    .sort();

  console.log(c.bold(`Installed subagents in ${c.cyan(targetDir)}: (${files.length} installed)\n`));
  if (files.length === 0) {
    console.log(c.dim('  (None installed yet)'));
  } else {
    for (let i = 0; i < files.length; i += 4) {
      const slice = files.slice(i, i + 4);
      console.log(`  ${slice.map((name) => c.green(name)).join(', ')}`);
    }
  }
  console.log();
  return files;
}

// Uninstall agents
function uninstallAgents(targetArg, targetDir) {
  if (!fs.existsSync(targetDir)) {
    console.log(c.yellow(`Nothing to uninstall: ${targetDir} does not exist.`));
    return;
  }

  const installed = fs.readdirSync(targetDir)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md');

  if (targetArg === 'all') {
    if (installed.length === 0) {
      console.log(c.dim('No agents to remove.'));
      return;
    }
    for (const f of installed) {
      fs.unlinkSync(path.join(targetDir, f));
    }
    console.log(c.green(`✓ Removed all ${installed.length} subagents from ${targetDir}`));
  } else {
    const names = targetArg.split(',').map((s) => s.trim());
    let removed = 0;
    for (const name of names) {
      const fileName = name.endsWith('.md') ? name : `${name}.md`;
      const filePath = path.join(targetDir, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`  ${c.red('✕')} Removed ${name}`);
        removed++;
      } else {
        console.log(`  ${c.yellow('?')} Agent not found: ${name}`);
      }
    }
    console.log(c.green(`✓ Uninstalled ${removed} subagent(s).`));
  }
}

// Install starter pack
function installStarterPack(catalogData, targetDir) {
  console.log(c.bold(`Installing Popular Starter Pack (10 subagents)...`));
  console.log(c.dim(`Target directory: ${targetDir}\n`));
  let installedCount = 0;
  for (const name of STARTER_PACK) {
    const agent = findAgentByName(name, catalogData.catalog);
    if (agent) {
      installAgentFile(agent, targetDir);
      installedCount++;
    } else {
      console.log(`  ${c.yellow('?')} Warning: ${name} not found in catalog.`);
    }
  }
  console.log();
  console.log(c.green(`✓ Successfully installed ${installedCount} starter subagents!`));
  printPostInstallInstructions(targetDir);
}

// Install category
function installCategory(catName, catalogData, targetDir) {
  const category = findCategory(catName, catalogData.categories);
  if (!category) {
    console.error(c.red(`Error: Category "${catName}" not found.`));
    console.log(`Available categories:\n  ${catalogData.categories.join('\n  ')}`);
    process.exit(1);
  }

  const agents = catalogData.catalog[category];
  console.log(c.bold(`Installing category ${c.cyan(category)} (${agents.length} subagents)...`));
  console.log(c.dim(`Target directory: ${targetDir}\n`));

  for (const agent of agents) {
    installAgentFile(agent, targetDir);
  }

  console.log();
  console.log(c.green(`✓ Successfully installed ${agents.length} subagents from ${category}!`));
  printPostInstallInstructions(targetDir);
}

// Install specific agents
function installSpecificAgents(names, catalogData, targetDir) {
  console.log(c.bold(`Installing selected subagents...`));
  console.log(c.dim(`Target directory: ${targetDir}\n`));

  let successCount = 0;
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const agent = findAgentByName(name, catalogData.catalog);
    if (agent) {
      installAgentFile(agent, targetDir);
      successCount++;
    } else {
      console.log(`  ${c.red('✕')} Agent "${name}" not found in catalog.`);
    }
  }

  console.log();
  console.log(c.green(`✓ Successfully installed ${successCount} subagent(s)!`));
  printPostInstallInstructions(targetDir);
}

// Install all agents
function installAllAgents(catalogData, targetDir) {
  console.log(c.bold(`Installing ALL ${catalogData.totalAgents} subagents across ${catalogData.categories.length} categories...`));
  console.log(c.dim(`Target directory: ${targetDir}\n`));

  let installedCount = 0;
  for (const cat of catalogData.categories) {
    console.log(`${c.magenta(c.bold(`Category: ${cat}`))}`);
    for (const agent of catalogData.catalog[cat]) {
      installAgentFile(agent, targetDir);
      installedCount++;
    }
    console.log();
  }

  console.log(c.green(`✓ Successfully installed all ${installedCount} subagents!`));
  printPostInstallInstructions(targetDir);
}

// Post-install message
function printPostInstallInstructions(targetDir) {
  console.log();
  console.log(c.bold('Next steps in ZCode:'));
  console.log(`  1. Restart your ZCode session or start a new conversation`);
  console.log(`  2. In ZCode, check ${c.cyan('Settings → Subagents')} to see your installed agents`);
  console.log(`  3. Subagents trigger automatically based on task descriptions, or invoke directly:`);
  console.log(`     ${c.dim('> Have @code-reviewer inspect my recent changes')}`);
  console.log();
}

// Interactive prompt runner
async function runInteractive(catalogData, targetDir) {
  printHeader(targetDir);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (q) => new Promise((resolve) => rl.question(q, resolve));

  while (true) {
    console.log(c.bold('What would you like to do?'));
    console.log(`  ${c.cyan('1)')} Install Popular Starter Pack ${c.dim('(10 curated essential agents)')}`);
    console.log(`  ${c.cyan('2)')} Install by Category ${c.dim('(choose from 10 categories)')}`);
    console.log(`  ${c.cyan('3)')} Install Specific Subagent(s)`);
    console.log(`  ${c.cyan('4)')} Install ALL Subagents ${c.dim(`(${catalogData.totalAgents} agents)`)}`);
    console.log(`  ${c.cyan('5)')} List Installed Subagents`);
    console.log(`  ${c.cyan('6)')} Uninstall Subagents`);
    console.log(`  ${c.cyan('0)')} Exit`);
    console.log();

    const answer = (await question(c.bold('Enter choice [0-6]: '))).trim();
    console.log();

    if (answer === '0' || answer.toLowerCase() === 'exit' || answer.toLowerCase() === 'q') {
      console.log('Goodbye!');
      rl.close();
      return;
    } else if (answer === '1') {
      installStarterPack(catalogData, targetDir);
    } else if (answer === '2') {
      console.log(c.bold('Available categories:'));
      catalogData.categories.forEach((cat, idx) => {
        console.log(`  ${c.cyan(`${idx + 1})`)} ${cat} ${c.dim(`(${catalogData.catalog[cat].length} agents)`)}`);
      });
      console.log();
      const catChoice = (await question(c.bold('Select category number or name (or 0 to cancel): '))).trim();
      console.log();
      if (catChoice !== '0' && catChoice !== '') {
        const num = parseInt(catChoice, 10);
        if (!isNaN(num) && num >= 1 && num <= catalogData.categories.length) {
          installCategory(catalogData.categories[num - 1], catalogData, targetDir);
        } else {
          installCategory(catChoice, catalogData, targetDir);
        }
      }
    } else if (answer === '3') {
      const agentInput = (await question(c.bold('Enter subagent name(s) (comma-separated, e.g. python-pro, debugger): '))).trim();
      console.log();
      if (agentInput) {
        installSpecificAgents(agentInput.split(','), catalogData, targetDir);
      }
    } else if (answer === '4') {
      const confirm = (await question(c.yellow(`Install all ${catalogData.totalAgents} subagents? [y/N]: `))).trim().toLowerCase();
      console.log();
      if (confirm === 'y' || confirm === 'yes') {
        installAllAgents(catalogData, targetDir);
      } else {
        console.log('Cancelled.');
      }
    } else if (answer === '5') {
      listInstalled(targetDir);
    } else if (answer === '6') {
      const unChoice = (await question(c.bold('Enter subagent name to uninstall, or "all" to remove all (or 0 to cancel): '))).trim();
      console.log();
      if (unChoice && unChoice !== '0') {
        uninstallAgents(unChoice, targetDir);
      }
    } else {
      console.log(c.red('Invalid choice. Please enter 0-6.\n'));
    }

    const continueChoice = (await question(c.dim('Press Enter to return to menu (or type "q" to exit): '))).trim().toLowerCase();
    if (continueChoice === 'q' || continueChoice === 'exit') {
      console.log('Goodbye!');
      rl.close();
      return;
    }
    console.log();
  }
}

// Main CLI parsing
async function main() {
  const args = process.argv.slice(2);
  let targetDir = getDefaultTargetDir();

  // Parse destination override first
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dest' || args[i] === '-d') {
      if (args[i + 1]) {
        targetDir = path.resolve(args[i + 1]);
        args.splice(i, 2);
        i--;
      }
    }
  }

  const catalogData = getCatalog();

  // If no arguments, launch interactive mode
  if (args.length === 0) {
    if (process.stdin.isTTY) {
      await runInteractive(catalogData, targetDir);
      return;
    } else {
      // Non-interactive environment with no flags -> print help
      printHelp(targetDir);
      return;
    }
  }

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp(targetDir);
      return;
    }

    if (arg === '--list' || arg === '-l') {
      printCatalog(catalogData);
      return;
    }

    if (arg === '--installed') {
      listInstalled(targetDir);
      return;
    }

    if (arg === '--starter' || arg === '-s') {
      installStarterPack(catalogData, targetDir);
      return;
    }

    if (arg === '--all' || arg === '-a') {
      installAllAgents(catalogData, targetDir);
      return;
    }

    if (arg === '--category' || arg === '-c') {
      const catArg = args[i + 1];
      if (!catArg) {
        console.error(c.red('Error: --category requires a category name or number.'));
        process.exit(1);
      }
      installCategory(catArg, catalogData, targetDir);
      return;
    }

    if (arg === '--agent' || arg === '-g' || arg === '--agents') {
      const agentArg = args[i + 1];
      if (!agentArg) {
        console.error(c.red('Error: --agent requires agent name(s).'));
        process.exit(1);
      }
      installSpecificAgents(agentArg.split(','), catalogData, targetDir);
      return;
    }

    if (arg === '--uninstall' || arg === '-u') {
      const unArg = args[i + 1] || 'all';
      uninstallAgents(unArg, targetDir);
      return;
    }

    // Direct category or agent name match shorthand
    const matchedCategory = findCategory(arg, catalogData.categories);
    if (matchedCategory) {
      installCategory(matchedCategory, catalogData, targetDir);
      return;
    }

    const matchedAgent = findAgentByName(arg, catalogData.catalog);
    if (matchedAgent) {
      installSpecificAgents([arg], catalogData, targetDir);
      return;
    }

    console.error(c.red(`Unknown option or argument: ${arg}`));
    console.log(`Run ${c.cyan('npx github:a2mus/awesome-zcode-subagents --help')} for usage instructions.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(c.red(`Unexpected error: ${err.message}`));
  process.exit(1);
});
