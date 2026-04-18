import type { ConfigurationStep } from '@/core/step'
import { BazarrIntegrationStep } from './bazarr/bazarr-integration'
import { BazarrLanguageProfilesStep } from './bazarr/bazarr-language-profiles'
import { BazarrLanguagesStep } from './bazarr/bazarr-languages'
import { BazarrProvidersStep } from './bazarr/bazarr-providers'
import { BazarrSubtitleDefaultsStep } from './bazarr/bazarr-subtitle-defaults'
import { BazarrConnectivityStep } from './connectivity/bazarr-connectivity'
import { PostgresConnectivityStep } from './connectivity/postgres-connectivity'
import { QBittorrentConnectivityStep } from './connectivity/qbittorrent-connectivity'
import { ServarrConnectivityStep } from './connectivity/servarr-connectivity'
import { BazarrConfigFileStep } from './infrastructure/bazarr-config-file'
import { PostgresDatabasesStep } from './infrastructure/postgres-databases'
import { PostgresUsersStep } from './infrastructure/postgres-users'
import { QBittorrentInitStep } from './infrastructure/qbittorrent-init'
import { ServarrConfigFileStep } from './infrastructure/servarr-config-file'
import { UserCreationStep } from './infrastructure/user-creation'
import { QBittorrentConfigStep } from './integrations/qbittorrent-config'
import { ApplicationsStep } from './servarr/applications'
import { CustomFormatsStep } from './servarr/custom-formats'
import { DownloadClientsStep } from './servarr/download-clients'
import { IndexersStep } from './servarr/indexers'
import { MediaManagementStep } from './servarr/media-management'
import { NamingConfigStep } from './servarr/naming-config'
import { QualityDefinitionsStep } from './servarr/quality-definitions'
import { QualityProfilesStep } from './servarr/quality-profiles'
import { ReleaseProfilesStep } from './servarr/release-profiles'
import { RootFoldersStep } from './servarr/root-folders'
import { ConfigLoadingStep } from './validation/config-loading'

export const allSteps: ConfigurationStep[] = [
  // Connectivity checks
  new PostgresConnectivityStep(),
  new ServarrConnectivityStep(),
  new QBittorrentConnectivityStep(),
  new BazarrConnectivityStep(),
  // Infrastructure (init mode)
  new PostgresDatabasesStep(),
  new PostgresUsersStep(),
  new ServarrConfigFileStep(),
  new BazarrConfigFileStep(),
  new UserCreationStep(),
  new QBittorrentInitStep(),
  // Validation
  new ConfigLoadingStep(),
  // Servarr configuration (sidecar mode)
  new RootFoldersStep(),
  new IndexersStep(),
  new DownloadClientsStep(),
  new CustomFormatsStep(),
  new QualityProfilesStep(),
  new QualityDefinitionsStep(),
  new NamingConfigStep(),
  new MediaManagementStep(),
  new ReleaseProfilesStep(),
  new ApplicationsStep(),
  // Integrations
  new QBittorrentConfigStep(),
  // Bazarr
  new BazarrIntegrationStep(),
  new BazarrLanguagesStep(),
  new BazarrProvidersStep(),
  new BazarrLanguageProfilesStep(),
  new BazarrSubtitleDefaultsStep(),
]
