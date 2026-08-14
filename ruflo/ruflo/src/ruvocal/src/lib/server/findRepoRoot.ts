import { existsSync } from "fs";
import { join, dirname } from "path";

export function findRepoRoot(startPath: string): string {
	let currentPath = startPath;
	while (currentPath !== "/") {
		if (existsSync(join(currentPath, "package.json"))) {
			return currentPath;
		}
		currentPath = dirname(currentPath);
	}
	throw new Error("Could not find repository root (no package.json found)");
}
