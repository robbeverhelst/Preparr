/**
 * E2E Test Utilities
 * Provides helpers for Kubernetes operations, API calls, and test coordination
 */

export const NAMESPACE = process.env.E2E_NAMESPACE || "preparr-test";

// API keys matching values-e2e.yaml
export const API_KEYS = {
	sonarr: "e2e1111111111111111111111111test",
	radarr: "e2e2222222222222222222222222test",
	prowlarr: "e2e0000000000000000000000000test",
} as const;

// Service ports matching values-e2e.yaml
export const PORTS = {
	sonarr: 8989,
	radarr: 7878,
	prowlarr: 9696,
	qbittorrent: 8080,
	postgres: 5432,
} as const;

// PrepArr health ports
export const HEALTH_PORTS = {
	sonarr: 9001,
	radarr: 9001,
	prowlarr: 9001,
} as const;

export type ServiceName = keyof typeof PORTS;
export type ServarrService = "sonarr" | "radarr" | "prowlarr";

interface KubectlResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * Execute a kubectl command
 */
export async function kubectl(args: string): Promise<KubectlResult> {
	const proc = Bun.spawn(["kubectl", ...args.split(" ").filter(Boolean)], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

/**
 * Get the service URL for in-cluster access
 */
export function getServiceUrl(
	service: ServiceName,
	port?: number
): string {
	const servicePort = port || PORTS[service];
	return `http://${service}.${NAMESPACE}.svc.cluster.local:${servicePort}`;
}

/**
 * Call a Servarr API endpoint
 */
export async function callServarrApi<T = unknown>(
	service: ServarrService,
	path: string,
	options?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
	const url = `${getServiceUrl(service)}${path}`;
	const apiKey = API_KEYS[service];

	try {
		const response = await fetch(url, {
			...options,
			headers: {
				"X-Api-Key": apiKey,
				"Content-Type": "application/json",
				...options?.headers,
			},
		});

		let data: T | null = null;
		const contentType = response.headers.get("content-type");
		if (contentType?.includes("application/json")) {
			data = (await response.json()) as T;
		}

		return {
			ok: response.ok,
			status: response.status,
			data,
		};
	} catch (error) {
		return {
			ok: false,
			status: 0,
			data: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Call PrepArr health endpoint
 */
export async function callPreparrHealth(
	service: ServarrService,
	endpoint: "/healthz" | "/ready" = "/healthz"
): Promise<{ ok: boolean; status: number; data: unknown | null; error?: string }> {
	const url = `http://${service}.${NAMESPACE}.svc.cluster.local:${HEALTH_PORTS[service]}${endpoint}`;

	try {
		const response = await fetch(url);
		let data: unknown = null;
		const contentType = response.headers.get("content-type");
		if (contentType?.includes("application/json")) {
			data = await response.json();
		}

		return {
			ok: response.ok,
			status: response.status,
			data,
		};
	} catch (error) {
		return {
			ok: false,
			status: 0,
			data: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Wait for a condition to be true
 */
export async function waitForCondition(
	condition: () => Promise<boolean>,
	options: {
		timeoutMs?: number;
		intervalMs?: number;
		description?: string;
	} = {}
): Promise<void> {
	const { timeoutMs = 60000, intervalMs = 2000, description = "condition" } = options;
	const start = Date.now();

	while (Date.now() - start < timeoutMs) {
		try {
			if (await condition()) {
				return;
			}
		} catch {
			// Condition threw, keep waiting
		}
		await Bun.sleep(intervalMs);
	}

	throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
}

/**
 * Wait for a pod to be ready
 */
export async function waitForPodReady(
	labelSelector: string,
	options: { timeoutMs?: number } = {}
): Promise<void> {
	const { timeoutMs = 120000 } = options;

	await waitForCondition(
		async () => {
			const result = await kubectl(
				`get pods -n ${NAMESPACE} -l ${labelSelector} -o jsonpath={.items[0].status.conditions[?(@.type=="Ready")].status}`
			);
			return result.exitCode === 0 && result.stdout === "True";
		},
		{ timeoutMs, description: `pod ${labelSelector} to be ready` }
	);
}

/**
 * Wait for a deployment to be available
 */
export async function waitForDeployment(
	deployment: string,
	options: { timeoutMs?: number } = {}
): Promise<void> {
	const { timeoutMs = 180000 } = options;

	const result = await kubectl(
		`rollout status deployment/${deployment} -n ${NAMESPACE} --timeout=${Math.floor(timeoutMs / 1000)}s`
	);

	if (result.exitCode !== 0) {
		throw new Error(`Deployment ${deployment} failed to rollout: ${result.stderr}`);
	}
}

/**
 * Wait for Servarr API to be accessible
 */
export async function waitForServarrApi(
	service: ServarrService,
	options: { timeoutMs?: number } = {}
): Promise<void> {
	const { timeoutMs = 120000 } = options;

	await waitForCondition(
		async () => {
			const result = await callServarrApi(service, "/api/v3/system/status");
			return result.ok;
		},
		{ timeoutMs, description: `${service} API to be accessible` }
	);
}

/**
 * Get init container exit code
 */
export async function getInitContainerExitCode(
	podLabel: string,
	containerName: string
): Promise<number | null> {
	const result = await kubectl(
		`get pods -n ${NAMESPACE} -l ${podLabel} -o jsonpath={.items[0].status.initContainerStatuses[?(@.name=="${containerName}")].state.terminated.exitCode}`
	);

	if (result.exitCode !== 0 || !result.stdout) {
		return null;
	}

	return Number.parseInt(result.stdout, 10);
}

/**
 * Get container logs
 */
export async function getContainerLogs(
	podLabel: string,
	containerName: string,
	options: { tail?: number; previous?: boolean } = {}
): Promise<string> {
	const { tail = 100, previous = false } = options;
	const previousFlag = previous ? "--previous" : "";

	const result = await kubectl(
		`logs -n ${NAMESPACE} -l ${podLabel} -c ${containerName} --tail=${tail} ${previousFlag}`
	);

	return result.stdout;
}

/**
 * Delete a resource and wait for deletion
 */
export async function deleteResource(
	kind: string,
	name: string,
	options: { timeoutMs?: number } = {}
): Promise<void> {
	const { timeoutMs = 30000 } = options;

	await kubectl(`delete ${kind} ${name} -n ${NAMESPACE} --wait=false`);

	await waitForCondition(
		async () => {
			const result = await kubectl(`get ${kind} ${name} -n ${NAMESPACE}`);
			return result.exitCode !== 0; // Resource is gone
		},
		{ timeoutMs, description: `${kind}/${name} to be deleted` }
	);
}

/**
 * Port forward to a service (returns cleanup function)
 */
export async function portForward(
	service: string,
	localPort: number,
	remotePort: number
): Promise<{ url: string; stop: () => void }> {
	const proc = Bun.spawn(
		["kubectl", "port-forward", `-n`, NAMESPACE, `svc/${service}`, `${localPort}:${remotePort}`],
		{
			stdout: "pipe",
			stderr: "pipe",
		}
	);

	// Wait a bit for port-forward to establish
	await Bun.sleep(2000);

	return {
		url: `http://localhost:${localPort}`,
		stop: () => proc.kill(),
	};
}
