import { isURLLocal } from "./isURLLocal";
import { describe, expect, it } from "vitest";

describe("isURLLocal", async () => {
	it("should return true for localhost", async () => {
		expect(await isURLLocal(new URL("http://localhost"))).toBe(true);
	});
	it("should return true for 127.0.0.1", async () => {
		expect(await isURLLocal(new URL("http://127.0.0.1"))).toBe(true);
	});
	it("should return true for 127.254.254.254", async () => {
		expect(await isURLLocal(new URL("http://127.254.254.254"))).toBe(true);
	});
	it("should return false for huggingface.co", async () => {
		expect(await isURLLocal(new URL("https://huggingface.co/"))).toBe(false);
	});
	it("should return true for 127.0.0.1.nip.io", async () => {
		expect(await isURLLocal(new URL("http://127.0.0.1.nip.io"))).toBe(true);
	});
	it("should fail on ipv6", async () => {
		await expect(isURLLocal(new URL("http://[::1]"))).rejects.toThrow();
	});
	it("should fail on ipv6 --1.sslip.io", async () => {
		await expect(isURLLocal(new URL("http://--1.sslip.io"))).rejects.toThrow();
	});
	it("should fail on invalid domain names", async () => {
		await expect(
			isURLLocal(new URL("http://34329487239847329874923948732984.com/"))
		).rejects.toThrow();
	});
});
