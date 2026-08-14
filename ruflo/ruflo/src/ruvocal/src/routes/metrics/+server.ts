import { config } from "$lib/server/config";
import { MetricsServer } from "$lib/server/metrics";

export async function GET() {
	if (config.METRICS_ENABLED !== "true") {
		return new Response("Not Found", { status: 404 });
	}

	const payload = await MetricsServer.getInstance().render();

	return new Response(payload, {
		status: 200,
		headers: {
			"Content-Type": "text/plain; version=0.0.4",
			"Cache-Control": "no-store",
		},
	});
}
