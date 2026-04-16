import type {
  LidarrClient,
  ProwlarrClient,
  RadarrClient,
  ReadarrClient,
  Sonarr,
  SonarrClient,
} from 'tsarr'

export type ServarrClientType =
  | SonarrClient
  | RadarrClient
  | LidarrClient
  | ReadarrClient
  | ProwlarrClient

export type IndexerResource = Sonarr.IndexerResource
export type DownloadClientResource = Sonarr.DownloadClientResource

export type ClientWithRootFolders = {
  getRootFolders(): Promise<{
    data?: Sonarr.RootFolderResource[]
    error?: unknown
    response: Response
  }>
  addRootFolder(
    path: string,
  ): Promise<{ data?: Sonarr.RootFolderResource; error?: unknown; response: Response }>
  deleteRootFolder(id: number): Promise<{ data?: unknown; error?: unknown; response: Response }>
}

export type ClientWithIndexers = {
  getIndexers(): Promise<{ data?: Sonarr.IndexerResource[]; error?: unknown; response: Response }>
  addIndexer(
    indexer: Partial<Sonarr.IndexerResource>,
  ): Promise<{ data?: Sonarr.IndexerResource; error?: unknown; response: Response }>
  deleteIndexer(id: number): Promise<{ data?: unknown; error?: unknown; response: Response }>
}

export type ClientWithDownloadClients = {
  getDownloadClients(): Promise<{
    data?: Sonarr.DownloadClientResource[]
    error?: unknown
    response: Response
  }>
  addDownloadClient(
    client: Partial<Sonarr.DownloadClientResource>,
  ): Promise<{ data?: Sonarr.DownloadClientResource; error?: unknown; response: Response }>
  deleteDownloadClient(id: number): Promise<{ data?: unknown; error?: unknown; response: Response }>
}

export type ClientWithHostConfig = {
  updateHostConfig(
    id: number,
    config: Record<string, unknown>,
  ): Promise<{ data?: unknown; error?: unknown; response: Response }>
}

export type ClientWithApplications = {
  getApplications(): Promise<{ data?: unknown[]; error?: unknown; response: Response }>
  addApplication(
    application: Record<string, unknown>,
  ): Promise<{ data?: unknown; error?: unknown; response: Response }>
  deleteApplication(id: number): Promise<{ data?: unknown; error?: unknown; response: Response }>
}

export interface ClientCapabilities {
  hasRootFolders: boolean
  hasDownloadClients: boolean
  hasApplications: boolean
  hasQualityProfiles: boolean
  hasCustomFormats: boolean
  hasReleaseProfiles: boolean
  hasNamingConfig: boolean
  hasMediaManagement: boolean
  hasQualityDefinitions: boolean
}

export interface DatabaseUser {
  Id: number
  Identifier: string
  Username: string
  Password: string
  Salt: string
  Iterations: number
}
