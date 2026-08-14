import type { ObjectId } from "mongodb";

export interface MigrationResult {
	_id: ObjectId;
	name: string;
	status: "success" | "failure" | "ongoing";
}
