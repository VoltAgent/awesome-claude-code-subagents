#!/usr/bin/env node
/**
 * Patch: Aggressive Text Pruning for Claude Code
 *
 * Extends Claude Code's micro-compaction (Vd function) to also prune old
 * user/assistant TEXT content, not just tool results. This keeps context
 * lean and prevents full compaction from ever being needed.
 *
 * What it does:
 *   After Vd() runs (pruning tool results), this patch adds a second pass
 *   that truncates old conversation text. It keeps the last N turns intact
 *   and replaces older text with brief summaries.
 *
 * How it works:
 *   Patches cli.js to insert a textPrune() function call after Vd().
 *   The function:
 *   1. Counts total text tokens in the message array
 *   2. If above threshold (configurable via CLAUDE_TEXT_PRUNE_THRESHOLD)
 *   3. Keeps the last CLAUDE_TEXT_PRUNE_KEEP turns intact
 *   4. Truncates older text blocks to first line + "[earlier context pruned]"
 *   5. Preserves tool_use/tool_result structure (never breaks the API contract)
 *
 * Safety:
 *   - Only modifies text content blocks, never tool_use or tool_result
 *   - Always keeps last N turns fully intact
 *   - Preserves message structure (role, type, ids)
 *   - Falls back gracefully if anything fails
 *   - Can be reverted by running: node patch-aggressive-prune.mjs --revert
 *
 * Usage:
 *   node patch-aggressive-prune.mjs          # Apply patch
 *   node patch-aggressive-prune.mjs --revert # Revert patch
 *   node patch-aggressive-prune.mjs --check  # Check if patched
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');
const CLI_PATH = join(PROJECT_ROOT, 'node_modules/@anthropic-ai/claude-agent-sdk/cli.js');
const BACKUP_PATH = CLI_PATH + '.backup';

const PATCH_MARKER = '/*AGGRESSIVE_TEXT_PRUNE_PATCH*/';

// The text pruning function to inject
const TEXT_PRUNE_FUNCTION = `
/*AGGRESSIVE_TEXT_PRUNE_PATCH*/
function _aggressiveTextPrune(messages) {
  try {
    var KEEP = parseInt(process.env.CLAUDE_TEXT_PRUNE_KEEP || '10', 10);
    var THRESHOLD = parseInt(process.env.CLAUDE_TEXT_PRUNE_THRESHOLD || '60000', 10);
    var MAX_OLD_TEXT = parseInt(process.env.CLAUDE_TEXT_PRUNE_MAX_CHARS || '150', 10);

    // Count text tokens roughly (4 chars per token)
    var totalChars = 0;
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if ((m.type === 'user' || m.type === 'assistant') && Array.isArray(m.message?.content)) {
        for (var j = 0; j < m.message.content.length; j++) {
          var c = m.message.content[j];
          if (c.type === 'text') totalChars += (c.text || '').length;
        }
      }
    }

    var totalTokensEst = Math.ceil(totalChars / 4);
    if (totalTokensEst < THRESHOLD) return messages;

    // Find turn boundaries (user message = new turn)
    var turnStarts = [];
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].type === 'user') turnStarts.push(i);
    }

    // Keep last KEEP turns intact
    var cutoffIdx = turnStarts.length > KEEP ? turnStarts[turnStarts.length - KEEP] : 0;
    if (cutoffIdx === 0) return messages;

    var pruned = [];
    var prunedChars = 0;
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (i >= cutoffIdx) {
        pruned.push(m);
        continue;
      }
      if ((m.type === 'user' || m.type === 'assistant') && Array.isArray(m.message?.content)) {
        var newContent = [];
        for (var j = 0; j < m.message.content.length; j++) {
          var c = m.message.content[j];
          if (c.type === 'text' && c.text && c.text.length > MAX_OLD_TEXT) {
            var firstLine = c.text.split('\\n')[0].slice(0, MAX_OLD_TEXT);
            prunedChars += c.text.length - firstLine.length - 30;
            newContent.push({ ...c, text: firstLine + '\\n[earlier context pruned]' });
          } else {
            newContent.push(c);
          }
        }
        pruned.push({ ...m, message: { ...m.message, content: newContent } });
      } else {
        pruned.push(m);
      }
    }

    if (prunedChars > 1000) {
      process.stderr?.write?.('[TextPrune] Pruned ~' + Math.round(prunedChars/4) + ' tokens of old text (kept last ' + KEEP + ' turns)\\n');
    }
    return pruned;
  } catch(e) {
    return messages;
  }
}
/*END_AGGRESSIVE_TEXT_PRUNE_PATCH*/`;

// The injection point: after Vd() call, before CT2() call
const VD_CALL_PATTERN = 'z=await Vd(F,void 0,Y);if(F=z.messages,';
const PATCHED_PATTERN = 'z=await Vd(F,void 0,Y);if(F=_aggressiveTextPrune(z.messages),';

function check() {
  const src = readFileSync(CLI_PATH, 'utf8');
  const isPatched = src.includes(PATCH_MARKER);
  console.log(isPatched ? 'PATCHED' : 'NOT PATCHED');
  return isPatched;
}

function apply() {
  if (check()) {
    console.log('Already patched. Use --revert first to re-apply.');
    return;
  }

  const src = readFileSync(CLI_PATH, 'utf8');

  // Verify the injection point exists
  if (!src.includes(VD_CALL_PATTERN)) {
    console.error('ERROR: Could not find Vd() call pattern in cli.js.');
    console.error('Claude Code may have been updated. Pattern expected:');
    console.error('  ' + VD_CALL_PATTERN);
    process.exit(1);
  }

  // Backup
  if (!existsSync(BACKUP_PATH)) {
    copyFileSync(CLI_PATH, BACKUP_PATH);
    console.log('Backup saved to:', BACKUP_PATH);
  }

  // Inject the function at the top of the file (after the first line)
  let patched = src;
  const firstNewline = patched.indexOf('\n');
  patched = patched.slice(0, firstNewline + 1) + TEXT_PRUNE_FUNCTION + '\n' + patched.slice(firstNewline + 1);

  // Patch the Vd() call site to also run our text pruner
  patched = patched.replace(VD_CALL_PATTERN, PATCHED_PATTERN);

  writeFileSync(CLI_PATH, patched);
  console.log('PATCH APPLIED successfully.');
  console.log('');
  console.log('Configuration (via env vars in settings.json):');
  console.log('  CLAUDE_TEXT_PRUNE_KEEP=10       # Keep last N turns intact');
  console.log('  CLAUDE_TEXT_PRUNE_THRESHOLD=60000 # Start pruning above this token count');
  console.log('  CLAUDE_TEXT_PRUNE_MAX_CHARS=150  # Truncate old text to this many chars');
  console.log('');
  console.log('Restart Claude Code for the patch to take effect.');
}

function revert() {
  if (!existsSync(BACKUP_PATH)) {
    console.error('No backup found at:', BACKUP_PATH);
    console.error('Cannot revert. Reinstall with: npm install @anthropic-ai/claude-agent-sdk');
    process.exit(1);
  }

  copyFileSync(BACKUP_PATH, CLI_PATH);
  console.log('REVERTED to original cli.js from backup.');
}

const arg = process.argv[2];
if (arg === '--revert') revert();
else if (arg === '--check') check();
else apply();
