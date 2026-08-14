import type { Session } from "./Session";
import type { Timestamps } from "./Timestamps";
import type { User } from "./User";

export interface MessageEvent extends Pick<Timestamps, "createdAt"> {
	userId: User["_id"] | Session["sessionId"];
	ip?: string;
	expiresAt: Date;
	type: "message" | "export";
}
