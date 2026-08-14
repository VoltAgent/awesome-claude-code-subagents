export interface Route {
	name: string;
	description: string;
	primary_model: string;
	fallback_models?: string[];
}

export interface RouteConfig {
	name: string;
	description: string;
}

export interface RouteSelection {
	routeName: string;
	error?: {
		message: string;
		statusCode?: number;
	};
}

export const ROUTER_FAILURE = "arch_router_failure";
