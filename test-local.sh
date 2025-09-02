#!/bin/bash

# Set up environment for local testing
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_DB=servarr

export SERVARR_URL=http://localhost:8989
export SERVARR_TYPE=sonarr
export SERVARR_ADMIN_USER=admin
export SERVARR_ADMIN_PASSWORD=adminpass

export CONFIG_PATH=$(pwd)/examples/sonarr-config.yaml
export CONFIG_WATCH=false
export CONFIG_RECONCILE_INTERVAL=30

export LOG_LEVEL=debug
export LOG_FORMAT=pretty

export HEALTH_PORT=9000

# For local testing, write to the Sonarr volume
export SERVARR_CONFIG_PATH=/var/lib/docker/volumes/preparr_sonarr_config/_data/config.xml

# Run PrepArr
echo "Starting PrepArr with local test configuration..."
bun run src/index.ts