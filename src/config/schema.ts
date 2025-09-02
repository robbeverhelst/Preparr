import { z } from 'zod'

export const PostgresConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(5432),
  username: z.string().default('postgres'),
  password: z.string(),
  database: z.string().default('servarr'),
})

export const ServarrConfigSchema = z.object({
  url: z.string().url(),
  type: z.enum(['sonarr', 'radarr', 'lidarr', 'readarr', 'prowlarr', 'auto']).default('auto'),
  apiKey: z
    .string()
    .length(32, 'API key must be exactly 32 characters')
    .regex(/^[a-f0-9]+$/, 'API key must be hexadecimal')
    .optional(),
  adminUser: z.string().default('admin'),
  adminPassword: z.string(),
})

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
  infoLink: z.string().optional(),
  tags: z.array(z.number()).default([]),
  fields: z.array(
    z.object({
      name: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
  ),
  enable: z.boolean().default(true),
  priority: z.number().default(25),
})

export const DownloadClientSchema = z.object({
  name: z.string(),
  implementation: z.string(),
  implementationName: z.string(),
  configContract: z.string(),
  fields: z.array(
    z.object({
      name: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
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

export const ServarrApplicationConfigSchema = z.object({
  rootFolders: z.array(RootFolderSchema).default([]),
  qualityProfiles: z.array(QualityProfileSchema).default([]),
  indexers: z.array(IndexerSchema).default([]),
  downloadClients: z.array(DownloadClientSchema).default([]),
  qbittorrent: QBittorrentConfigSchema,
})

export const EnvironmentConfigSchema = z.object({
  postgres: PostgresConfigSchema,
  servarr: ServarrConfigSchema,
  services: ServiceIntegrationSchema.optional(),
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
export type QBittorrentConfig = z.infer<typeof QBittorrentConfigSchema>
export type ServarrApplicationConfig = z.infer<typeof ServarrApplicationConfigSchema>
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>
