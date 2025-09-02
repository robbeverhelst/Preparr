import type { PostgresConfig } from '@/config/schema'
import { logger } from '@/utils/logger'
import { SQL } from 'bun'

interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  factor?: number
}

export class PostgresClient {
  private config: PostgresConfig
  private db: SQL | null = null
  private adminDb: SQL | null = null

  constructor(config: PostgresConfig) {
    this.config = config
  }

  private getConnectionString(database = 'postgres'): string {
    return `postgres://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}/${database}`
  }

  private connect(): void {
    if (!this.db) {
      const connString = this.getConnectionString(this.config.database)
      this.db = new SQL(connString)
      logger.debug('Connected to application database', { database: this.config.database })
    }

    if (!this.adminDb) {
      const adminConnString = this.getConnectionString('postgres')
      this.adminDb = new SQL(adminConnString)
      logger.debug('Connected to admin database')
    }
  }

  private async withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const { maxRetries = 5, initialDelay = 1000, maxDelay = 30000, factor = 2 } = options

    let lastError: Error | unknown
    let delay = initialDelay

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        if (attempt === maxRetries) {
          logger.error('Operation failed after all retries', {
            attempts: maxRetries + 1,
            error,
          })
          break
        }

        logger.debug('Operation failed, retrying...', {
          attempt: attempt + 1,
          nextDelay: delay,
          error: error instanceof Error ? error.message : String(error),
        })

        await new Promise((resolve) => setTimeout(resolve, delay))
        delay = Math.min(delay * factor, maxDelay)
      }
    }

    throw lastError
  }

  async testConnection(): Promise<boolean> {
    try {
      this.connect()

      if (!this.adminDb) {
        throw new Error('Admin database connection not established')
      }

      const db = this.adminDb
      const result = await this.withRetry(async () => db`SELECT 1 as connected`, {
        maxRetries: 3,
        initialDelay: 500,
      })

      if (result && result[0]?.connected === 1) {
        logger.info('PostgreSQL connection test successful')
        return true
      }
      return false
    } catch (error) {
      logger.error('PostgreSQL connection test failed', { error })
      return false
    }
  }

  async createDatabase(dbName: string): Promise<void> {
    this.connect()

    if (!this.adminDb) {
      throw new Error('Admin database connection not established')
    }

    try {
      // Try to create the database without retry wrapper for better error handling
      await this.adminDb.unsafe(`CREATE DATABASE ${dbName}`)
      logger.info('Database created successfully', { database: dbName })
    } catch (error: unknown) {
      // Check if database already exists - this is OK
      if (error instanceof Error && error.message.includes('already exists')) {
        logger.debug('Database already exists', { database: dbName })
      } else {
        // For other errors, retry
        try {
          await this.withRetry(
            async () => {
              await this.adminDb?.unsafe(`CREATE DATABASE ${dbName}`)
            },
            { maxRetries: 2, initialDelay: 500 },
          )
          logger.info('Database created successfully after retry', { database: dbName })
        } catch (retryError) {
          logger.error('Failed to create database', { database: dbName, error: retryError })
          throw retryError
        }
      }
    }
  }

  async createUser(username: string, password: string): Promise<void> {
    this.connect()

    if (!this.adminDb) {
      throw new Error('Admin database connection not established')
    }

    try {
      await this.withRetry(
        async () => {
          // Create user with encrypted password
          await this.adminDb?.unsafe(
            `CREATE USER ${username} WITH ENCRYPTED PASSWORD '${password}'`,
          )
        },
        { maxRetries: 2, initialDelay: 500 },
      )

      logger.info('User created successfully', { username })
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('already exists')) {
        logger.debug('User already exists', { username })
        // Update password if user exists
        try {
          await this.adminDb?.unsafe(`ALTER USER ${username} WITH ENCRYPTED PASSWORD '${password}'`)
          logger.info('User password updated', { username })
        } catch (updateError) {
          logger.error('Failed to update user password', { username, error: updateError })
        }
      } else {
        logger.error('Failed to create user', { username, error })
        throw error
      }
    }
  }

  async grantPermissions(username: string, database: string): Promise<void> {
    this.connect()

    if (!this.adminDb) {
      throw new Error('Admin database connection not established')
    }

    try {
      await this.withRetry(
        async () => {
          // Grant all privileges on database
          await this.adminDb?.unsafe(`GRANT ALL PRIVILEGES ON DATABASE ${database} TO ${username}`)

          // Connect to the specific database to grant schema permissions
          const dbConnection = new SQL(this.getConnectionString(database))

          // Grant permissions on schema
          await dbConnection.unsafe(`GRANT ALL ON SCHEMA public TO ${username}`)

          // Grant permissions on all tables, sequences, and functions
          await dbConnection.unsafe(
            `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${username}`,
          )
          await dbConnection.unsafe(
            `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${username}`,
          )
          await dbConnection.unsafe(
            `GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO ${username}`,
          )

          // Set default privileges for future objects
          await dbConnection.unsafe(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${username}`,
          )
          await dbConnection.unsafe(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${username}`,
          )
          await dbConnection.unsafe(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${username}`,
          )

          dbConnection.close()
        },
        { maxRetries: 3, initialDelay: 1000 },
      )

      logger.info('Permissions granted successfully', { username, database })
    } catch (error) {
      logger.error('Failed to grant permissions', { username, database, error })
      throw error
    }
  }

  async initializeServarrDatabases(servarrType: string): Promise<void> {
    logger.info('Initializing Servarr PostgreSQL databases...', { type: servarrType })

    const isConnected = await this.testConnection()
    if (!isConnected) {
      throw new Error('Cannot connect to PostgreSQL')
    }

    // Create main and log databases for Servarr
    const mainDb = `${servarrType}_main`
    const logDb = `${servarrType}_log`

    await this.createDatabase(mainDb)
    await this.createDatabase(logDb)

    // Create user specific to this Servarr instance
    await this.createUser(servarrType, this.config.password)

    // Grant permissions on both databases
    await this.grantPermissions(servarrType, mainDb)
    await this.grantPermissions(servarrType, logDb)

    logger.info('Servarr PostgreSQL initialization completed', {
      type: servarrType,
      databases: [mainDb, logDb],
    })
  }

  async initialize(): Promise<void> {
    logger.info('Initializing PostgreSQL...')

    const isConnected = await this.testConnection()
    if (!isConnected) {
      throw new Error('Cannot connect to PostgreSQL')
    }

    // Create default database if it doesn't exist
    await this.createDatabase(this.config.database)

    logger.info('PostgreSQL initialization completed')
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
    if (this.adminDb) {
      this.adminDb.close()
      this.adminDb = null
    }
    logger.debug('PostgreSQL connections closed')
  }
}
