import { z } from 'zod'

export const PostgresConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(5432),
  username: z.string().default('postgres'),
  password: z.string(),
  database: z.string().default('servarr'),
  skipProvisioning: z.boolean().default(false),
})

export const ServarrConfigSchema = z
  .object({
    url: z.string().optional(),
    type: z
      .enum(['sonarr', 'radarr', 'lidarr', 'readarr', 'prowlarr', 'qbittorrent', 'bazarr', 'auto'])
      .default('auto'),
    apiKey: z
      .string()
      .length(32, 'API key must be exactly 32 characters')
      .regex(/^[a-f0-9]+$/, 'API key must be hexadecimal')
      .optional(),
    adminUser: z.string().default('admin'),
    adminPassword: z.string().optional(),
    authenticationMethod: z.enum(['basic', 'forms']).default('forms'),
  })
  .refine(
    (data) => {
      // URL validation: required for all Servarr types except qbittorrent and bazarr
      if (data.type !== 'qbittorrent' && data.type !== 'bazarr') {
        if (!data.url) {
          return false
        }
        // Validate URL format for non-qbittorrent/bazarr types
        try {
          new URL(data.url)
        } catch {
          return false
        }
      }
      return true
    },
    {
      message: 'Valid URL is required when type is not qbittorrent or bazarr',
      path: ['url'],
    },
  )
  .refine(
    (data) => {
      // adminPassword validation: required for Servarr types, optional for qbittorrent and bazarr
      if (data.type !== 'qbittorrent' && data.type !== 'bazarr') {
        if (!data.adminPassword) {
          return false
        }
      }
      return true
    },
    {
      message: 'Admin password is required when type is not qbittorrent or bazarr',
      path: ['adminPassword'],
    },
  )

export const BazarrLanguageSchema = z.object({
  code: z.string(),
  name: z.string(),
  enabled: z.boolean().default(true),
})

export const BazarrProviderSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
})

export const BazarrSubtitleDefaultsSchema = z.object({
  seriesType: z.string().default('hearing_impaired_preferred'),
  movieType: z.string().default('hearing_impaired_preferred'),
  searchOnUpgrade: z.boolean().default(true),
  searchOnDownload: z.boolean().default(true),
})

export const BazarrConfigSchema = z
  .object({
    url: z.string().url().optional(),
    apiKey: z.string().optional(),
    sonarr: z
      .object({
        url: z.string().url(),
        apiKey: z.string(),
      })
      .optional(),
    radarr: z
      .object({
        url: z.string().url(),
        apiKey: z.string(),
      })
      .optional(),
    languages: z.array(BazarrLanguageSchema).default([]),
    providers: z.array(BazarrProviderSchema).default([]),
    subtitleDefaults: BazarrSubtitleDefaultsSchema.optional(),
  })
  .optional()

export const ServiceIntegrationSchema = z.object({
  qbittorrent: z
    .object({
      url: z.string().url(),
      username: z.string(),
      password: z.string(),
    })
    .optional(),
  prowlarr: z
    .object({
      url: z.string().url(),
      apiKey: z.string().optional(),
    })
    .optional(),
  bazarr: z
    .object({
      url: z.string().url(),
      apiKey: z.string().optional(),
    })
    .optional(),
})

export const RootFolderSchema = z.object({
  path: z.string(),
  accessible: z.boolean().default(true),
  freeSpace: z.number().optional(),
  unmappedFolders: z.array(z.string()).default([]),
})

// Custom Format Specification Schema
export const CustomFormatSpecificationSchema = z.object({
  name: z.string(),
  implementation: z.string(),
  negate: z.boolean().default(false),
  required: z.boolean().default(false),
  fields: z
    .array(
      z.object({
        name: z.string(),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]),
      }),
    )
    .default([]),
})

// Custom Format Schema (Radarr/Sonarr v4+)
export const CustomFormatSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  includeCustomFormatWhenRenaming: z.boolean().default(false),
  specifications: z.array(CustomFormatSpecificationSchema).default([]),
})

// Format Item for Quality Profile integration
export const FormatItemSchema = z.object({
  format: z.string(), // Reference by name (resolved to ID at runtime)
  score: z.number(),
})

export const QualityProfileSchema = z.object({
  name: z.string(),
  cutoff: z.number(),
  items: z.array(
    z.object({
      quality: z.object({
        id: z.number(),
        name: z.string(),
      }),
      allowed: z.boolean(),
    }),
  ),
  // Custom Format integration
  formatItems: z.array(FormatItemSchema).default([]),
  minFormatScore: z.number().default(0),
  cutoffFormatScore: z.number().default(0),
  upgradeAllowed: z.boolean().default(true),
})

// Release Profile Schema (Sonarr only)
export const ReleaseProfileTermSchema = z.object({
  key: z.string(), // The term or regex pattern
  value: z.number(), // Score
})

export const ReleaseProfileSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  enabled: z.boolean().default(true),
  required: z.string().nullable().default(null), // Comma-separated or null
  ignored: z.string().nullable().default(null), // Comma-separated or null
  preferred: z.array(ReleaseProfileTermSchema).default([]),
  includePreferredWhenRenaming: z.boolean().default(false),
  indexerId: z.number().default(0), // 0 = all indexers
  tags: z.array(z.number()).default([]),
})

// Naming Configuration Schema
export const NamingConfigSchema = z.object({
  // Sonarr fields
  renameEpisodes: z.boolean().optional(),
  standardEpisodeFormat: z.string().optional(),
  dailyEpisodeFormat: z.string().optional(),
  animeEpisodeFormat: z.string().optional(),
  seriesFolderFormat: z.string().optional(),
  seasonFolderFormat: z.string().optional(),
  specialsFolderFormat: z.string().optional(),
  multiEpisodeStyle: z.number().optional(), // 0-5
  // Radarr fields
  renameMovies: z.boolean().optional(),
  movieFormat: z.string().optional(),
  movieFolderFormat: z.string().optional(),
  colonReplacementFormat: z.number().optional(),
  // Lidarr fields
  renameTracks: z.boolean().optional(),
  trackFormat: z.string().optional(),
  artistFolderFormat: z.string().optional(),
  albumFolderFormat: z.string().optional(),
  // Readarr fields
  renameBooks: z.boolean().optional(),
  standardBookFormat: z.string().optional(),
  authorFolderFormat: z.string().optional(),
  // Common
  replaceIllegalCharacters: z.boolean().default(true),
})

// Media Management Configuration Schema
export const MediaManagementConfigSchema = z.object({
  // File handling
  importExtraFiles: z.boolean().default(false),
  extraFileExtensions: z.string().default('srt,sub,idx'),
  // Permissions
  setPermissionsLinux: z.boolean().default(false),
  chmodFolder: z.string().default('755'),
  chmodFile: z.string().default('644'),
  chownGroup: z.string().optional(),
  // Download handling
  autoUnmonitorPreviouslyDownloaded: z.boolean().default(false),
  downloadPropersAndRepacks: z.string().default('preferAndUpgrade'), // 'preferAndUpgrade' | 'doNotUpgrade' | 'doNotPrefer'
  createEmptySeriesFolders: z.boolean().optional(), // Sonarr
  createEmptyMovieFolders: z.boolean().optional(), // Radarr
  deleteEmptyFolders: z.boolean().default(false),
  // File management
  fileDate: z.string().default('none'), // 'none' | 'localAirDate' | 'utcAirDate'
  recycleBin: z.string().optional(),
  recycleBinCleanupDays: z.number().default(7),
  // Hardlinks/Copy
  skipFreeSpaceCheckWhenImporting: z.boolean().default(false),
  minimumFreeSpaceWhenImporting: z.number().default(100), // MB
  copyUsingHardlinks: z.boolean().default(true),
  useScriptImport: z.boolean().default(false),
  scriptImportPath: z.string().optional(),
  // Analysis
  enableMediaInfo: z.boolean().default(true),
  rescanAfterRefresh: z.string().default('always'), // 'always' | 'afterManual' | 'never'
})

// Quality Definition Schema
export const QualityDefinitionSchema = z.object({
  quality: z.string(), // Quality name like "Bluray-1080p"
  title: z.string().optional(), // Display title
  minSize: z.number().min(0).optional(), // MB per minute
  maxSize: z.number().min(0).optional(), // MB per minute (null = unlimited)
  preferredSize: z.number().min(0).optional(), // MB per minute
})

export const IndexerSchema = z.object({
  name: z.string(),
  implementation: z.string(),
  implementationName: z.string(),
  configContract: z.string(),
  infoLink: z.string().nullable().optional(),
  tags: z.array(z.number()).default([]),
  fields: z.array(
    z.object({
      name: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]),
    }),
  ),
  enable: z.boolean().default(true),
  priority: z.number().default(25),
  appProfileId: z.number().optional(),
})

export const DownloadClientSchema = z.object({
  name: z.string(),
  implementation: z.string(),
  implementationName: z.string(),
  configContract: z.string(),
  fields: z.array(
    z.object({
      name: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]),
    }),
  ),
  enable: z.boolean().default(true),
  priority: z.number().default(1),
})

export const QBittorrentConfigSchema = z
  .object({
    webui: z
      .object({
        username: z.string().default('admin'),
        password: z.string().default('adminpass'),
      })
      .optional(),
    downloads: z
      .object({
        defaultPath: z.string().default('/downloads'),
        categories: z.array(z.string()).default([]),
      })
      .optional(),
    connection: z
      .object({
        port: z.number().default(6881),
      })
      .optional(),
  })
  .optional()

export const ApplicationSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  implementation: z.string(),
  implementationName: z.string(),
  configContract: z.string(),
  appProfileId: z.number().optional(),
  fields: z.array(
    z.object({
      name: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]),
    }),
  ),
  enable: z.boolean().default(true),
  syncLevel: z.string().default('addOnly'),
  tags: z.array(z.number()).default([]),
})

export const AppConfigSchema = z.object({
  apiKey: z.string().optional(),
  prowlarrSync: z.boolean().default(false),
  rootFolders: z.array(RootFolderSchema).default([]),
  qualityProfiles: z.array(QualityProfileSchema).default([]),
  indexers: z.array(IndexerSchema).optional(),
  downloadClients: z.array(DownloadClientSchema).default([]),
  applications: z.array(ApplicationSchema).default([]),
  qbittorrent: QBittorrentConfigSchema,
  // Custom Formats (Radarr/Sonarr v4+)
  customFormats: z.array(CustomFormatSchema).default([]),
  // Release Profiles (Sonarr only)
  releaseProfiles: z.array(ReleaseProfileSchema).default([]),
  // Naming Configuration
  naming: NamingConfigSchema.optional(),
  // Media Management
  mediaManagement: MediaManagementConfigSchema.optional(),
  // Quality Definitions (size limits)
  qualityDefinitions: z.array(QualityDefinitionSchema).default([]),
  bazarr: BazarrConfigSchema,
  // Bazarr-specific configuration (integrations, languages, providers)
  integrations: z
    .object({
      sonarr: z
        .object({
          enabled: z.boolean().optional(),
          url: z.string().optional(),
          apiKey: z.string().optional(),
        })
        .optional(),
      radarr: z
        .object({
          enabled: z.boolean().optional(),
          url: z.string().optional(),
          apiKey: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  languages: z
    .array(
      z.object({
        code: z.string(),
        name: z.string(),
      }),
    )
    .optional(),
  providers: z
    .array(
      z.object({
        name: z.string(),
        enabled: z.boolean().optional(),
      }),
    )
    .optional(),
})

export const ConfigSchema = z.object({
  postgres: PostgresConfigSchema,
  servarr: ServarrConfigSchema,
  services: ServiceIntegrationSchema.optional(),
  // Unified application desired-state config
  app: AppConfigSchema.default({
    prowlarrSync: false,
    rootFolders: [],
    qualityProfiles: [],
    downloadClients: [],
    applications: [],
    customFormats: [],
    releaseProfiles: [],
    qualityDefinitions: [],
  }),
  health: z
    .object({
      port: z.number().default(8080),
    })
    .default({ port: 8080 }),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFormat: z.enum(['json', 'pretty']).default('json'),
  configPath: z.string().default('/config/servarr.yaml'),
  configWatch: z.boolean().default(true),
  configReconcileInterval: z.number().default(60),
})

export type PostgresConfig = z.infer<typeof PostgresConfigSchema>
export type ServarrConfig = z.infer<typeof ServarrConfigSchema>
export type ServiceIntegration = z.infer<typeof ServiceIntegrationSchema>
export type RootFolder = z.infer<typeof RootFolderSchema>
export type CustomFormatSpecification = z.infer<typeof CustomFormatSpecificationSchema>
export type CustomFormat = z.infer<typeof CustomFormatSchema>
export type FormatItem = z.infer<typeof FormatItemSchema>
export type QualityProfile = z.infer<typeof QualityProfileSchema>
export type ReleaseProfileTerm = z.infer<typeof ReleaseProfileTermSchema>
export type ReleaseProfile = z.infer<typeof ReleaseProfileSchema>
export type NamingConfig = z.infer<typeof NamingConfigSchema>
export type MediaManagementConfig = z.infer<typeof MediaManagementConfigSchema>
export type QualityDefinition = z.infer<typeof QualityDefinitionSchema>
export type Indexer = z.infer<typeof IndexerSchema>
export type DownloadClient = z.infer<typeof DownloadClientSchema>
export type Application = z.infer<typeof ApplicationSchema>
export type QBittorrentConfig = z.infer<typeof QBittorrentConfigSchema>
export type BazarrLanguage = z.infer<typeof BazarrLanguageSchema>
export type BazarrProvider = z.infer<typeof BazarrProviderSchema>
export type BazarrSubtitleDefaults = z.infer<typeof BazarrSubtitleDefaultsSchema>
export type BazarrConfig = z.infer<typeof BazarrConfigSchema>
export type AppConfig = z.infer<typeof AppConfigSchema>
export type Config = z.infer<typeof ConfigSchema>
