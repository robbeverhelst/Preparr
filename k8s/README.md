# PrepArr Kubernetes Testing

This directory contains Kubernetes manifests to test PrepArr's download client password update functionality in a controlled environment.

## Architecture

- **Namespace**: `preparr-test` - isolated testing environment
- **PostgreSQL**: Database for PrepArr metadata
- **qBittorrent**: Download client with PrepArr init container for password management
- **Sonarr**: Media manager with PrepArr sidecar for download client configuration

## Deployment

```bash
# Deploy everything
./k8s/deploy.sh

# Test password change functionality
./k8s/test-password-change.sh

# Clean up
./k8s/cleanup.sh
```

## Manual Testing

1. **Deploy the stack**:
   ```bash
   ./k8s/deploy.sh
   ```

2. **Access services**:
   ```bash
   # qBittorrent WebUI
   kubectl port-forward -n preparr-test svc/qbittorrent 8080:8080
   
   # Sonarr WebUI  
   kubectl port-forward -n preparr-test svc/sonarr 8989:8989
   
   # Sonarr Sidecar Health
   kubectl port-forward -n preparr-test svc/sonarr 9001:9001
   ```

3. **Test initial state**:
   - qBittorrent should be accessible with `admin/adminpass`
   - Sonarr should have qBittorrent configured as download client

4. **Change qBittorrent password**:
   ```bash
   ./k8s/test-password-change.sh
   ```

5. **Verify updates**:
   - qBittorrent should only accept new password `newpassword123`
   - Sonarr sidecar should detect mismatch and update download client
   - Check sidecar logs: `kubectl logs -n preparr-test deployment/sonarr -c preparr-sidecar`

## Expected Behavior

When qBittorrent password changes:

1. **qBittorrent init container** detects PBKDF2 hash mismatch
2. **Updates qBittorrent config** with new password hash
3. **qBittorrent restarts** with new credentials
4. **Sonarr sidecar** detects download client password mismatch
5. **Updates Sonarr download client** with new password
6. **Download client connectivity restored**

## Monitoring

```bash
# Watch all pods
kubectl get pods -n preparr-test -w

# Check init container logs
kubectl logs -n preparr-test deployment/qbittorrent -c preparr-init

# Check sidecar logs
kubectl logs -n preparr-test deployment/sonarr -c preparr-sidecar

# Check sidecar health
curl http://localhost:9001/health
```