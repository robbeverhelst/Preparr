/**
 * E2E Test Setup
 * Verifies deployment is ready before running tests
 */

import {
	NAMESPACE,
	waitForDeployment,
	waitForServarrApi,
	kubectl,
} from "./utils";

const DEPLOYMENTS = ["postgres", "qbittorrent", "prowlarr", "sonarr", "radarr"];
const SERVARR_SERVICES = ["sonarr", "radarr", "prowlarr"] as const;

/**
 * Verify all deployments are ready
 */
export async function verifyDeploymentsReady(): Promise<void> {
	console.log(`Verifying deployments in namespace: ${NAMESPACE}`);

	// Check namespace exists
	const nsResult = await kubectl(`get namespace ${NAMESPACE}`);
	if (nsResult.exitCode !== 0) {
		throw new Error(`Namespace ${NAMESPACE} does not exist`);
	}

	// Wait for each deployment
	for (const deployment of DEPLOYMENTS) {
		console.log(`  Waiting for ${deployment}...`);
		await waitForDeployment(deployment, { timeoutMs: 180000 });
		console.log(`  ${deployment} ready`);
	}
}

/**
 * Verify all Servarr APIs are accessible
 */
export async function verifyServarrApisReady(): Promise<void> {
	console.log("Verifying Servarr APIs...");

	for (const service of SERVARR_SERVICES) {
		console.log(`  Waiting for ${service} API...`);
		await waitForServarrApi(service, { timeoutMs: 120000 });
		console.log(`  ${service} API ready`);
	}
}

/**
 * Full pre-test verification
 */
export async function verifyTestEnvironment(): Promise<void> {
	await verifyDeploymentsReady();
	await verifyServarrApisReady();
	console.log("Test environment ready");
}
