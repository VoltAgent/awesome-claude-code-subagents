import type { Timestamps } from "./Timestamps";

export interface ConversationStats extends Timestamps {
	date: {
		at: Date;
		span: "day" | "week" | "month";
		field: "updatedAt" | "createdAt";
	};
	type: "conversation" | "message";
	/**  _id => number of conversations/messages in the month */
	distinct: "sessionId" | "userId" | "userOrSessionId" | "_id";
	count: number;
}
