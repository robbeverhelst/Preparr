#!/bin/bash

echo "Testing qBittorrent password change functionality..."

# Step 1: Check initial state
echo "1. Checking initial qBittorrent login..."
kubectl port-forward -n preparr-test svc/qbittorrent 8080:8080 &
PF_PID=$!
sleep 5

# Test initial login
LOGIN_RESULT=$(curl -s -d "username=admin&password=adminpass" -X POST http://localhost:8080/api/v2/auth/login)
echo "Initial login result: $LOGIN_RESULT"

# Step 2: Change password in ConfigMap
echo "2. Updating qBittorrent password to 'newpassword123'..."
kubectl patch configmap qbittorrent-config -n preparr-test --patch '{"data":{"qbittorrent-config.json":"{\"qbittorrent\":{\"webui\":{\"username\":\"admin\",\"password\":\"newpassword123\"},\"downloads\":{\"defaultPath\":\"/downloads\"},\"connection\":{\"port\":6881}}}"}}'

# Step 3: Update qBittorrent deployment environment
echo "3. Updating qBittorrent deployment environment..."
kubectl patch deployment qbittorrent -n preparr-test --patch '{"spec":{"template":{"spec":{"initContainers":[{"name":"preparr-init","env":[{"name":"POSTGRES_HOST","value":"postgres"},{"name":"POSTGRES_PORT","value":"5432"},{"name":"POSTGRES_USER","value":"postgres"},{"name":"POSTGRES_PASSWORD","value":"postgres123"},{"name":"POSTGRES_DB","value":"servarr"},{"name":"SERVARR_TYPE","value":"qbittorrent"},{"name":"QBITTORRENT_USER","value":"admin"},{"name":"QBITTORRENT_PASSWORD","value":"newpassword123"},{"name":"CONFIG_PATH","value":"/config/qbittorrent-config.json"}]}]}}}}'

# Step 4: Update Sonarr config
echo "4. Updating Sonarr download client password..."
kubectl patch configmap sonarr-config -n preparr-test --patch '{"data":{"sonarr-config.json":"{\"app\":{\"apiKey\":\"2bac5d00dca43258313c734821a15c4c\",\"prowlarrSync\":true,\"rootFolders\":[{\"path\":\"/tv\",\"accessible\":true}],\"qualityProfiles\":[{\"name\":\"HD - 1080p\",\"cutoff\":1080,\"items\":[{\"quality\":{\"id\":1,\"name\":\"HDTV-1080p\"},\"allowed\":true},{\"quality\":{\"id\":2,\"name\":\"WEBDL-1080p\"},\"allowed\":true}]}],\"downloadClients\":[{\"name\":\"qBittorrent\",\"implementation\":\"QBittorrent\",\"implementationName\":\"qBittorrent\",\"configContract\":\"QBittorrentSettings\",\"fields\":[{\"name\":\"host\",\"value\":\"qbittorrent\"},{\"name\":\"port\",\"value\":8080},{\"name\":\"username\",\"value\":\"admin\"},{\"name\":\"password\",\"value\":\"newpassword123\"},{\"name\":\"category\",\"value\":\"tv\"},{\"name\":\"priority\",\"value\":0},{\"name\":\"removeCompletedDownloads\",\"value\":false},{\"name\":\"removeFailedDownloads\",\"value\":false}],\"enable\":true,\"priority\":1}]},\"services\":{\"qbittorrent\":{\"url\":\"http://qbittorrent:8080\",\"username\":\"admin\",\"password\":\"newpassword123\"}}}"}}'

# Step 5: Restart deployments to trigger update
echo "5. Restarting deployments..."
kubectl rollout restart deployment qbittorrent -n preparr-test
kubectl rollout restart deployment sonarr -n preparr-test

# Wait for rollouts
echo "6. Waiting for rollouts to complete..."
kubectl rollout status deployment qbittorrent -n preparr-test --timeout=300s
kubectl rollout status deployment sonarr -n preparr-test --timeout=300s

# Kill port forward
kill $PF_PID 2>/dev/null

echo "7. Testing new password..."
kubectl port-forward -n preparr-test svc/qbittorrent 8080:8080 &
PF_PID=$!
sleep 10

# Test new login
NEW_LOGIN_RESULT=$(curl -s -d "username=admin&password=newpassword123" -X POST http://localhost:8080/api/v2/auth/login)
echo "New password login result: $NEW_LOGIN_RESULT"

# Test old password should fail
OLD_LOGIN_RESULT=$(curl -s -d "username=admin&password=adminpass" -X POST http://localhost:8080/api/v2/auth/login)
echo "Old password login result (should fail): $OLD_LOGIN_RESULT"

# Cleanup
kill $PF_PID 2>/dev/null

echo "Password change test complete!"
echo "Check Sonarr sidecar logs for download client updates:"
echo "kubectl logs -n preparr-test deployment/sonarr -c preparr-sidecar --tail=50"