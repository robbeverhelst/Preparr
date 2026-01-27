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
      .enum(['sonarr', 'radarr', 'lidarr', 'readarr', 'prowlarr', 'qbittorrent', 'auto'])
      .default('auto'),
    apiKey: z
      .string()
      .length(32, 'API key must be exactly 32 characters')
      .regex(/^[a-f0-9]+$/, 'API key must be hexadecimal')
      .optional(),
    adminUser: z.string().default('admin'),
    adminPassword: z.string(),
    authenticationMethod: z.enum(['basic', 'forms']).default('forms'),
  })
  .refine(
    (data) => {
      // URL validation: required for all Servarr types except qbittorrent
      if (data.type !== 'qbittorrent') {
        if (!data.url) {
          return false
        }
        // Validate URL format for non-qbittorrent types
        try {
          new URL(data.url)
        } catch {
          return false
        }
      }
      return true
    },
    {
      message: 'Valid URL is required when type is not qbittorrent',
      path: ['url'],
    },
  )

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
})

export const RootFolderSchema = z.object({
  path: z.string(),
  accessible: z.boolean().default(true),
  freeSpace: z.number().optional(),
  unmappedFolders: z.array(z.string()).default([]),
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
  }),
  health: z
    .object({
      port: z.number().default(8080),
    })
    .default({}),
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
export type QualityProfile = z.infer<typeof QualityProfileSchema>
export type Indexer = z.infer<typeof IndexerSchema>
export type DownloadClient = z.infer<typeof DownloadClientSchema>
export type Application = z.infer<typeof ApplicationSchema>
export type QBittorrentConfig = z.infer<typeof QBittorrentConfigSchema>
export type AppConfig = z.infer<typeof AppConfigSchema>
export type Config = z.infer<typeof ConfigSchema>
