import { randomUUID } from "$lib/utils/randomUuid";
import { timeout } from "$lib/utils/timeout";
import { logger } from "./logger";

type ExitHandler = () => void | Promise<void>;
type ExitHandlerUnsubscribe = () => void;

const listeners = new Map<string, ExitHandler>();

export function onExit(cb: ExitHandler): ExitHandlerUnsubscribe {
	const uuid = randomUUID();
	listeners.set(uuid, cb);
	return () => {
		listeners.delete(uuid);
	};
}

async function runExitHandler(handler: ExitHandler): Promise<void> {
	return timeout(Promise.resolve().then(handler), 30_000).catch((err) => {
		logger.error(err, "Exit handler failed to run");
	});
}

export function initExitHandler() {
	let signalCount = 0;
	const exitHandler = async () => {
		if (signalCount === 1) {
			logger.info("Received signal... Exiting");
			await Promise.all(Array.from(listeners.values()).map(runExitHandler));
			logger.info("All exit handlers ran... Waiting for svelte server to exit");
		}
	};

	process.on("SIGINT", () => {
		signalCount++;

		if (signalCount >= 2) {
			process.kill(process.pid, "SIGKILL");
		} else {
			exitHandler().catch((err) => {
				logger.error(err, "Error in exit handler on SIGINT:");
				process.kill(process.pid, "SIGKILL");
			});
		}
	});

	process.on("SIGTERM", () => {
		signalCount++;

		if (signalCount >= 2) {
			process.kill(process.pid, "SIGKILL");
		} else {
			exitHandler().catch((err) => {
				logger.error(err, "Error in exit handler on SIGTERM:");
				process.kill(process.pid, "SIGKILL");
			});
		}
	});
}
