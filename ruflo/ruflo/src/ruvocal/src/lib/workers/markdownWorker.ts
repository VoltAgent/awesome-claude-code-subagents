// Simple type to replace removed WebSearchSource
type SimpleSource = {
	title?: string;
	link: string;
};
import { processBlocks, type BlockToken } from "$lib/utils/marked";

export type IncomingMessage = {
	type: "process";
	content: string;
	sources: SimpleSource[];
	requestId: number;
};

export type OutgoingMessage = {
	type: "processed";
	blocks: BlockToken[];
	requestId: number;
};

// Flag to track if the worker is currently processing a message
let isProcessing = false;

// Buffer to store the latest incoming message
let latestMessage: IncomingMessage | null = null;

// Helper function to safely handle the latest message
async function processMessage() {
	if (latestMessage) {
		const nextMessage = latestMessage;

		latestMessage = null;
		isProcessing = true;

		try {
			const { content, sources, requestId } = nextMessage;
			const processedBlocks = await processBlocks(content, sources);
			postMessage(
				JSON.parse(JSON.stringify({ type: "processed", blocks: processedBlocks, requestId }))
			);
		} finally {
			isProcessing = false;

			// After processing, check if a new message was buffered
			await new Promise((resolve) => setTimeout(resolve, 100));
			processMessage();
		}
	}
}

onmessage = (event) => {
	if (event.data.type !== "process") {
		return;
	}

	latestMessage = event.data as IncomingMessage;

	if (!isProcessing && latestMessage) {
		processMessage();
	}
};
