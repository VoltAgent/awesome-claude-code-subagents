// Ideally shouldn't be needed, see https://github.com/huggingface/chat-ui/pull/88#issuecomment-1523173850

import type { Conversation } from "./Conversation";
import type { Timestamps } from "./Timestamps";

export interface AbortedGeneration extends Timestamps {
	conversationId: Conversation["_id"];
}
