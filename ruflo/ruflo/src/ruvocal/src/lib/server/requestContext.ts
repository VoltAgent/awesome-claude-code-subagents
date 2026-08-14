import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface RequestContext {
	requestId: string;
	url?: string;
	ip?: string;
	user?: string;
	statusCode?: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function within a request context.
 * All logs within this context will automatically include the requestId.
 */
export function runWithRequestContext<T>(
	fn: () => T,
	context: Partial<RequestContext> & { requestId?: string } = {}
): T {
	const fullContext: RequestContext = {
		requestId: context.requestId ?? randomUUID(),
		url: context.url,
		ip: context.ip,
		user: context.user,
		statusCode: context.statusCode,
	};
	return asyncLocalStorage.run(fullContext, fn);
}

/**
 * Update the current request context with additional information.
 * Useful for adding user information after authentication.
 */
export function updateRequestContext(updates: Partial<Omit<RequestContext, "requestId">>): void {
	const store = asyncLocalStorage.getStore();
	if (store) {
		Object.assign(store, updates);
	}
}

/**
 * Get the current request context, if any.
 */
export function getRequestContext(): RequestContext | undefined {
	return asyncLocalStorage.getStore();
}

/**
 * Get the current request ID, or undefined if not in a request context.
 */
export function getRequestId(): string | undefined {
	return asyncLocalStorage.getStore()?.requestId;
}
