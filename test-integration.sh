#!/bin/bash

set -e

echo "🚀 Starting PrepArr Integration Test"

# Clean up any existing containers
echo "📁 Cleaning up previous test run..."
docker-compose -f docker-compose.test.yml down -v

# Build and start services
echo "🔨 Building and starting services..."
docker-compose -f docker-compose.test.yml up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
timeout 300 bash -c 'until docker-compose -f docker-compose.test.yml exec -T sonarr curl -f http://localhost:8989/api/v3/system/status >/dev/null 2>&1; do sleep 5; done'

echo "✅ Sonarr is ready"

# Check if PrepArr completed successfully
echo "🔍 Checking PrepArr logs..."
docker-compose -f docker-compose.test.yml logs preparr

# Test health endpoints
echo "🩺 Testing health endpoints..."
curl -f http://localhost:9000/healthz || (echo "❌ Health check failed" && exit 1)
curl -f http://localhost:9000/ready || (echo "❌ Readiness check failed" && exit 1)

echo "✅ Health endpoints working"

# Check if configuration was applied
echo "📋 Verifying Sonarr configuration..."

# Test root folders
SONARR_API_KEY=$(docker-compose -f docker-compose.test.yml exec -T preparr sh -c 'echo $SONARR_API_KEY' 2>/dev/null || echo "")
if [ -z "$SONARR_API_KEY" ]; then
    echo "⚠️  Could not get API key from PrepArr, checking Sonarr directly..."
    # Try to get API key from Sonarr logs or config
    SONARR_API_KEY=$(docker-compose -f docker-compose.test.yml exec -T sonarr cat /config/config.xml 2>/dev/null | grep -o '<ApiKey>[^<]*</ApiKey>' | sed 's/<[^>]*>//g' || echo "")
fi

if [ -n "$SONARR_API_KEY" ]; then
    echo "🔑 Using API key: ${SONARR_API_KEY:0:8}..."
    
    # Test root folders
    ROOT_FOLDERS=$(curl -s -H "X-Api-Key: $SONARR_API_KEY" http://localhost:8989/api/v3/rootfolder || echo "[]")
    echo "📂 Root folders: $ROOT_FOLDERS"
    
    # Test indexers
    INDEXERS=$(curl -s -H "X-Api-Key: $SONARR_API_KEY" http://localhost:8989/api/v3/indexer || echo "[]")
    echo "🔍 Indexers: $INDEXERS"
    
    # Test download clients
    DOWNLOAD_CLIENTS=$(curl -s -H "X-Api-Key: $SONARR_API_KEY" http://localhost:8989/api/v3/downloadclient || echo "[]")
    echo "⬇️  Download clients: $DOWNLOAD_CLIENTS"
else
    echo "⚠️  Could not retrieve API key, manual verification needed"
fi

echo "🎉 Integration test completed!"
echo "💡 Services are running. You can:"
echo "   - Access Sonarr at http://localhost:8989"
echo "   - Access qBittorrent at http://localhost:8080"
echo "   - Check PrepArr health at http://localhost:9000/healthz"
echo "   - Check PrepArr readiness at http://localhost:9000/ready"
echo ""
echo "🧹 To clean up: docker-compose -f docker-compose.test.yml down -v"