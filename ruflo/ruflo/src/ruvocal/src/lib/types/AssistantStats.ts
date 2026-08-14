import type { Timestamps } from "./Timestamps";
import type { Assistant } from "./Assistant";

export interface AssistantStats extends Timestamps {
	assistantId: Assistant["_id"];
	date: {
		at: Date;
		span: "hour";
	};
	count: number;
}
