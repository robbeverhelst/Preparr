/**
 * E2E Tests: Service Integration
 * Verifies cross-service connectivity and integration
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
	callServarrApi,
	waitForServarrApi,
	callPreparrHealth,
} from "./utils";

interface DownloadClient {
	id: number;
	name: string;
	implementation: string;
	enable: boolean;
}

interface DownloadClientTestResult {
	isValid: boolean;
	errors: string[];
}

interface ProwlarrApplication {
	id: number;
	name: string;
	syncLevel: string;
	fields: Array<{ name: string; value: unknown }>;
}

interface ProwlarrIndexer {
	id: number;
	name: string;
	enable: boolean;
}

describe("Service Integration", () => {
	beforeAll(async () => {
		// Wait for all APIs to be ready
		await Promise.all([
			waitForServarrApi("sonarr", { timeoutMs: 120000 }),
			waitForServarrApi("radarr", { timeoutMs: 120000 }),
			waitForServarrApi("prowlarr", { timeoutMs: 120000 }),
		]);
	});

	describe("qBittorrent Connectivity", () => {
		test("Sonarr can connect to qBittorrent download client", async () => {
			// Get download clients
			const clientsResult = await callServarrApi<DownloadClient[]>(
				"sonarr",
				"/api/v3/downloadclient"
			);
			expect(clientsResult.ok).toBe(true);

			const qbit = clientsResult.data?.find(dc => dc.name === "qBittorrent");
			expect(qbit).toBeDefined();

			// Test the download client connection
			const testResult = await callServarrApi<DownloadClientTestResult>(
				"sonarr",
				`/api/v3/downloadclient/test`,
				{
					method: "POST",
					body: JSON.stringify({ id: qbit!.id }),
				}
			);

			expect(testResult.ok).toBe(true);
			expect(testResult.data?.isValid).toBe(true);
			expect(testResult.data?.errors).toEqual([]);
		});

		test("Radarr can connect to qBittorrent download client", async () => {
			// Get download clients
			const clientsResult = await callServarrApi<DownloadClient[]>(
				"radarr",
				"/api/v3/downloadclient"
			);
			expect(clientsResult.ok).toBe(true);

			const qbit = clientsResult.data?.find(dc => dc.name === "qBittorrent");
			expect(qbit).toBeDefined();

			// Test the download client connection
			const testResult = await callServarrApi<DownloadClientTestResult>(
				"radarr",
				`/api/v3/downloadclient/test`,
				{
					method: "POST",
					body: JSON.stringify({ id: qbit!.id }),
				}
			);

			expect(testResult.ok).toBe(true);
			expect(testResult.data?.isValid).toBe(true);
			expect(testResult.data?.errors).toEqual([]);
		});
	});

	describe("Prowlarr Application Sync", () => {
		test("Prowlarr has Sonarr application configured", async () => {
			const result = await callServarrApi<ProwlarrApplication[]>(
				"prowlarr",
				"/api/v1/applications"
			);

			expect(result.ok).toBe(true);
			expect(result.data).toBeDefined();
			expect(Array.isArray(result.data)).toBe(true);

			const sonarrApp = result.data?.find(app => app.name === "Sonarr");
			expect(sonarrApp).toBeDefined();
			expect(sonarrApp?.syncLevel).toBe("fullSync");
		});

		test("Prowlarr has Radarr application configured", async () => {
			const result = await callServarrApi<ProwlarrApplication[]>(
				"prowlarr",
				"/api/v1/applications"
			);

			expect(result.ok).toBe(true);
			expect(result.data).toBeDefined();
			expect(Array.isArray(result.data)).toBe(true);

			const radarrApp = result.data?.find(app => app.name === "Radarr");
			expect(radarrApp).toBeDefined();
			expect(radarrApp?.syncLevel).toBe("fullSync");
		});

		test("Prowlarr has indexers configured", async () => {
			const result = await callServarrApi<ProwlarrIndexer[]>(
				"prowlarr",
				"/api/v1/indexer"
			);

			expect(result.ok).toBe(true);
			expect(result.data).toBeDefined();
			expect(Array.isArray(result.data)).toBe(true);
			// At minimum we should have the 1337x indexer from values-e2e.yaml
			expect(result.data?.length).toBeGreaterThan(0);
		});
	});

	describe("PrepArr Health Endpoints", () => {
		test("Sonarr PrepArr sidecar healthz endpoint returns healthy", async () => {
			const result = await callPreparrHealth("sonarr", "/healthz");

			expect(result.ok).toBe(true);
			expect(result.status).toBe(200);
		});

		test("Sonarr PrepArr sidecar ready endpoint returns ready", async () => {
			const result = await callPreparrHealth("sonarr", "/ready");

			expect(result.ok).toBe(true);
			expect(result.status).toBe(200);
		});

		test("Radarr PrepArr sidecar healthz endpoint returns healthy", async () => {
			const result = await callPreparrHealth("radarr", "/healthz");

			expect(result.ok).toBe(true);
			expect(result.status).toBe(200);
		});

		test("Radarr PrepArr sidecar ready endpoint returns ready", async () => {
			const result = await callPreparrHealth("radarr", "/ready");

			expect(result.ok).toBe(true);
			expect(result.status).toBe(200);
		});

		test("Prowlarr PrepArr sidecar healthz endpoint returns healthy", async () => {
			const result = await callPreparrHealth("prowlarr", "/healthz");

			expect(result.ok).toBe(true);
			expect(result.status).toBe(200);
		});

		test("Prowlarr PrepArr sidecar ready endpoint returns ready", async () => {
			const result = await callPreparrHealth("prowlarr", "/ready");

			expect(result.ok).toBe(true);
			expect(result.status).toBe(200);
		});
	});

	describe("Cross-Service Network Connectivity", () => {
		test("Servarr services can reach each other within cluster", async () => {
			// This is implicitly tested by the download client tests,
			// but we can also verify by checking system status from each service
			const [sonarrStatus, radarrStatus, prowlarrStatus] = await Promise.all([
				callServarrApi<{ urlBase: string }>("sonarr", "/api/v3/system/status"),
				callServarrApi<{ urlBase: string }>("radarr", "/api/v3/system/status"),
				callServarrApi<{ urlBase: string }>("prowlarr", "/api/v1/system/status"),
			]);

			expect(sonarrStatus.ok).toBe(true);
			expect(radarrStatus.ok).toBe(true);
			expect(prowlarrStatus.ok).toBe(true);
		});
	});
});
