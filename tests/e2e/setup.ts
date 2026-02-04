/**
 * E2E Test Setup
 * Verifies deployment is ready before running tests
 */

import type { BazarrService, ServarrService } from './utils'
import { kubectl, NAMESPACE, waitForBazarrApi, waitForDeployment, waitForServarrApi } from './utils'

const DEPLOYMENTS = ['postgres', 'qbittorrent', 'prowlarr', 'sonarr', 'radarr']
const SERVARR_SERVICES: readonly ServarrService[] = ['sonarr', 'radarr', 'prowlarr']
const BAZARR_SERVICE: BazarrService = 'bazarr'

/**
 * Verify all deployments are ready
 */
export async function verifyDeploymentsReady(): Promise<void> {
  const nsResult = await kubectl(`get namespace ${NAMESPACE}`)
  if (nsResult.exitCode !== 0) {
    throw new Error(`Namespace ${NAMESPACE} does not exist`)
  }

  for (const deployment of DEPLOYMENTS) {
    await waitForDeployment(deployment, { timeoutMs: 180000 })
  }
}

/**
 * Verify all Servarr APIs are accessible
 */
export async function verifyServarrApisReady(): Promise<void> {
  for (const service of SERVARR_SERVICES) {
    await waitForServarrApi(service, { timeoutMs: 120000 })
  }
}

/**
 * Verify Bazarr API is accessible
 */
export async function verifyBazarrApiReady(): Promise<void> {
  await waitForBazarrApi(BAZARR_SERVICE, { timeoutMs: 120000 })
}

/**
 * Full pre-test verification
 */
export async function verifyTestEnvironment(): Promise<void> {
  await verifyDeploymentsReady()
  await verifyServarrApisReady()
  // TODO: Re-enable Bazarr verification once Helm deployment is fixed
  // await verifyBazarrApiReady()
}
