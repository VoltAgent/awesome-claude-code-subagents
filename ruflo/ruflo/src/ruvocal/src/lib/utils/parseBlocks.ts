/*
 * Copyright 2023 Vercel, Inc.
 * Adapted from: https://github.com/vercel/streamdown/blob/main/packages/streamdown/lib/parse-blocks.tsx
 */

import { Lexer } from "marked";

/**
 * Parses markdown into independent blocks for efficient memoization during streaming.
 * Blocks are split at natural boundaries while keeping related content together.
 */
export function parseMarkdownIntoBlocks(markdown: string): string[] {
	// Check if the markdown contains footnotes (references or definitions)
	// Footnote references: [^1], [^label], etc.
	// Footnote definitions: [^1]: text, [^label]: text, etc.
	// Use atomic groups or possessive quantifiers to prevent backtracking
	const hasFootnoteReference = /\[\^[^\]\s]{1,200}\](?!:)/.test(markdown);
	const hasFootnoteDefinition = /\[\^[^\]\s]{1,200}\]:/.test(markdown);

	// If footnotes are present, return the entire document as a single block
	// This ensures footnote references and definitions remain in the same mdast tree
	if (hasFootnoteReference || hasFootnoteDefinition) {
		return [markdown];
	}

	const tokens = Lexer.lex(markdown, { gfm: true });

	// Post-process to merge consecutive blocks that belong together
	const mergedBlocks: string[] = [];
	const htmlStack: string[] = []; // Track opening HTML tags

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const currentBlock = token.raw;

		// Check if we're inside an HTML block
		if (htmlStack.length > 0) {
			// We're inside an HTML block, merge with the previous block
			mergedBlocks[mergedBlocks.length - 1] += currentBlock;

			// Check if this token closes an HTML tag
			if (token.type === "html") {
				const closingTagMatch = currentBlock.match(/<\/(\w+)>/);
				if (closingTagMatch) {
					const closingTag = closingTagMatch[1];
					// Check if this closes the most recent opening tag
					if (htmlStack[htmlStack.length - 1] === closingTag) {
						htmlStack.pop();
					}
				}
			}
			continue;
		}

		// Check if this is an opening HTML block tag
		if (token.type === "html" && token.block) {
			const openingTagMatch = currentBlock.match(/<(\w+)[\s>]/);
			if (openingTagMatch) {
				const tagName = openingTagMatch[1];
				// Check if this is a self-closing tag or if there's a closing tag in the same block
				const hasClosingTag = currentBlock.includes(`</${tagName}>`);
				if (!hasClosingTag) {
					// This is an opening tag without a closing tag in the same block
					htmlStack.push(tagName);
				}
			}
		}

		// Math block merging logic (existing)
		// Check if this is a standalone $$ that might be a closing delimiter
		if (currentBlock.trim() === "$$" && mergedBlocks.length > 0) {
			const previousBlock = mergedBlocks.at(-1);

			if (!previousBlock) {
				mergedBlocks.push(currentBlock);
				continue;
			}

			// Check if the previous block starts with $$ but doesn't end with $$
			const prevStartsWith$$ = previousBlock.trimStart().startsWith("$$");
			const prevDollarCount = (previousBlock.match(/\$\$/g) || []).length;

			// If previous block has odd number of $$ and starts with $$, merge them
			if (prevStartsWith$$ && prevDollarCount % 2 === 1) {
				mergedBlocks[mergedBlocks.length - 1] = previousBlock + currentBlock;
				continue;
			}
		}

		// Check if current block ends with $$ and previous block started with $$ but didn't close
		if (mergedBlocks.length > 0 && currentBlock.trimEnd().endsWith("$$")) {
			const previousBlock = mergedBlocks.at(-1);

			if (!previousBlock) {
				mergedBlocks.push(currentBlock);
				continue;
			}

			const prevStartsWith$$ = previousBlock.trimStart().startsWith("$$");
			const prevDollarCount = (previousBlock.match(/\$\$/g) || []).length;
			const currDollarCount = (currentBlock.match(/\$\$/g) || []).length;

			// If previous block has unclosed math (odd $$) and current block ends with $$
			// AND current block doesn't start with $$, it's likely a continuation
			if (
				prevStartsWith$$ &&
				prevDollarCount % 2 === 1 &&
				!currentBlock.trimStart().startsWith("$$") &&
				currDollarCount === 1
			) {
				mergedBlocks[mergedBlocks.length - 1] = previousBlock + currentBlock;
				continue;
			}
		}

		mergedBlocks.push(currentBlock);
	}

	return mergedBlocks;
}
