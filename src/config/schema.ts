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
  type: z.enum(['sonarr', 'radarr', 'lidarr', 'readarr', 'prowlarr']),
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

export const EnvironmentConfigSchema = z.object({
  postgres: PostgresConfigSchema,
  servarr: ServarrConfigSchema,
  services: ServiceIntegrationSchema.optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFormat: z.enum(['json', 'pretty']).default('json'),
  configPath: z.string().default('/config/config.yaml'),
  configWatch: z.boolean().default(true),
  reconcileInterval: z.number().default(60),
})

export type PostgresConfig = z.infer<typeof PostgresConfigSchema>
export type ServarrConfig = z.infer<typeof ServarrConfigSchema>
export type ServiceIntegration = z.infer<typeof ServiceIntegrationSchema>
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>
