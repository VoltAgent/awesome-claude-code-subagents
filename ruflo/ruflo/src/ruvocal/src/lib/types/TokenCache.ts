import type { Timestamps } from "./Timestamps";

export interface TokenCache extends Timestamps {
	tokenHash: string; // sha256 of the bearer token
	userId: string; // the matching hf user id
}
