# Troubleshooting Guide

Common issues and solutions when deploying and running PrepArr.

## Quick Diagnostics

### Health Check Status
```bash
# Check sidecar health
curl http://localhost:9001/health

# Check readiness
curl http://localhost:9001/ready

# Docker Compose
docker compose logs sonarr-sidecar

# Kubernetes
kubectl logs -n media-stack deployment/sonarr -c preparr-sidecar
```

### Container Status
```bash
# Docker Compose - check init container completion
docker compose ps

# Kubernetes - check init container status  
kubectl describe pod -n media-stack sonarr-xxx
```

## Common Issues

### 1. Init Container Failures

#### PostgreSQL Connection Issues

**Symptoms**:
```
ERROR: Failed to connect to PostgreSQL
FATAL: database "servarr" does not exist
```

**Solutions**:
```bash
# Check PostgreSQL is running and accessible
docker compose logs postgres

# Verify environment variables
docker compose config

# Test direct connection
docker run --rm postgres:16-alpine psql -h postgres -U postgres -d servarr -c "SELECT 1;"
```

**Check Configuration**:
- Ensure `POSTGRES_HOST` points to correct service name
- Verify `POSTGRES_PASSWORD` matches PostgreSQL container
- Confirm PostgreSQL container is healthy before init runs

#### Servarr URL Unreachable

**Symptoms**:
```
ERROR: Servarr application not accessible at http://sonarr:8989
ERROR: Failed to verify Servarr connectivity
```

**Solutions**:
```bash
# Check if Servarr container is running
docker compose ps sonarr

# Test connectivity from init container
docker compose exec sonarr-init curl -f http://sonarr:8989

# Verify DNS resolution
docker compose exec sonarr-init nslookup sonarr
```

**Configuration Fixes**:
- Ensure `SERVARR_URL` uses correct service name and port
- Verify Servarr container starts before init container
- Check Docker network connectivity

#### API Key Generation Failures

**Symptoms**:
```
ERROR: No API key found in config.xml - init container may have failed
ERROR: Failed to extract or generate API key
```

**Solutions**:
```bash
# Check config.xml was created
docker compose exec sonarr cat /config/config.xml

# Verify shared volume mounting
docker compose exec sonarr-init ls -la /config/

# Check init container logs for detailed errors
docker compose logs sonarr-init
```

**Common Causes**:
- Shared volume not properly mounted
- Insufficient permissions on config directory
- Init container exited before completing setup

### 2. Sidecar Runtime Issues

#### Configuration Loading Failures

**Symptoms**:
```
ERROR: Configuration file not found: /config/sonarr-config.json
ERROR: Configuration validation failed
```

**Solutions**:
```bash
# Verify config file exists and is readable
docker compose exec sonarr-sidecar cat /config/sonarr-config.json

# Check file permissions
docker compose exec sonarr-sidecar ls -la /config/

# Validate JSON syntax
docker compose exec sonarr-sidecar bunx --print 'JSON.parse(Bun.file("/config/sonarr-config.json").text())'
```

**Configuration Fixes**:
- Ensure JSON file is valid (no trailing commas, proper quotes)
- Verify file is mounted as read-only from host
- Check volume mount paths match `CONFIG_PATH`

#### Servarr API Connection Issues

**Symptoms**:
```
ERROR: Failed to connect to Servarr API
ERROR: API key authentication failed
```

**Solutions**:
```bash
# Test API connectivity
curl -H "X-Api-Key: your-api-key" http://sonarr:8989/api/v3/system/status

# Check API key in config.xml
docker compose exec sonarr grep -o 'ApiKey>.*<' /config/config.xml

# Verify sidecar can reach Servarr
docker compose exec sonarr-sidecar curl -f http://sonarr:8989
```

**Common Fixes**:
- Wait for Servarr to fully initialize after container start
- Verify API key matches between config.xml and JSON config
- Ensure Servarr container is accessible on specified port

#### Reconciliation Loop Errors

**Symptoms**:
```
ERROR: Step failed: quality-profiles
WARN: Configuration drift detected
ERROR: Failed to apply configuration changes
```

**Solutions**:
```bash
# Check specific step failures
docker compose logs sonarr-sidecar | grep "Step failed"

# Increase log level for debugging
# Set LOG_LEVEL=debug in environment
docker compose up -d sonarr-sidecar

# Verify current vs desired state
curl -H "X-Api-Key: api-key" http://sonarr:8989/api/v3/qualityprofile
```

### 3. Indexer Management Issues

#### Prowlarr Sync Not Working

**Symptoms**:
```
INFO: Prowlarr sync enabled, skipping indexer management
# But no indexers appear in Sonarr/Radarr
```

**Solutions**:
```bash
# Verify Prowlarr application configuration
curl -H "X-Api-Key: prowlarr-key" http://prowlarr:9696/api/v1/applications

# Check Prowlarr can reach target applications
curl -H "X-Api-Key: prowlarr-key" http://prowlarr:9696/api/v1/applications/test

# Test indexer sync manually
curl -X POST -H "X-Api-Key: prowlarr-key" http://prowlarr:9696/api/v1/applications/sync
```

**Configuration Checks**:
- Ensure `prowlarrSync: true` in Sonarr/Radarr config
- Verify Prowlarr application settings have correct API keys
- Check Prowlarr can reach Sonarr/Radarr URLs
- Confirm indexers are enabled and have proper app profiles

#### Indexers Being Removed

**Symptoms**:
```
INFO: Indexer removed successfully: "The Pirate Bay (Prowlarr)"
# Indexers disappear after sidecar reconciliation
```

**Solutions**:
```bash
# Check for conflicting indexer configurations
grep -r "indexers" /config/

# Verify prowlarrSync setting
cat /config/sonarr-config.json | grep prowlarrSync

# Review sidecar prerequisite checks
docker compose logs sonarr-sidecar | grep "prerequisite"
```

**Fix**:
- Set `"prowlarrSync": true` in config
- Remove `"indexers": []` from configuration
- Restart sidecar container

### 4. Docker Compose Issues

#### Service Dependencies Not Working

**Symptoms**:
```
ERROR: Init container started before PostgreSQL ready
ERROR: Sidecar started before Servarr ready
```

**Solution**:
```yaml
# Ensure proper depends_on with health checks
sonarr-init:
  depends_on:
    postgres:
      condition: service_healthy

sonarr:
  depends_on:
    sonarr-init:
      condition: service_completed_successfully

sonarr-sidecar:
  depends_on:
    - sonarr
```

#### Volume Mount Issues

**Symptoms**:
```
ERROR: Permission denied: /config/sonarr-config.json
ERROR: No such file or directory
```

**Solutions**:
```bash
# Check host file exists and permissions
ls -la ./sonarr-config.json

# Fix permissions
chmod 644 ./sonarr-config.json

# Verify mount syntax
docker compose config | grep volumes -A 5
```

### 5. Kubernetes Issues

#### Init Container Stuck

**Symptoms**:
```bash
kubectl get pods
# Shows Init:0/1 status indefinitely
```

**Diagnosis**:
```bash
# Check init container logs
kubectl logs pod-name -c preparr-init

# Check events
kubectl describe pod pod-name

# Verify configmap and secrets
kubectl get configmap sonarr-config -o yaml
kubectl get secret postgres-secret -o yaml
```

#### ConfigMap Updates Not Applied

**Symptoms**:
Configuration changes not reflected in running containers.

**Solutions**:
```bash
# Force pod restart after ConfigMap update
kubectl rollout restart deployment/sonarr

# Or delete pods to force recreation
kubectl delete pod -l app=sonarr

# Verify ConfigMap was updated
kubectl get configmap sonarr-config -o yaml
```

#### Service Discovery Issues

**Symptoms**:
```
ERROR: Failed to resolve service hostname
```

**Solutions**:
```bash
# Test DNS resolution
kubectl exec -it pod-name -- nslookup postgres-service

# Check service configuration
kubectl get svc
kubectl describe svc postgres-service

# Verify network policies (if using)
kubectl get networkpolicy
```

### 6. PostgreSQL Issues

#### Database Connection Limits

**Symptoms**:
```
ERROR: remaining connection slots are reserved for non-replication superuser connections
```

**Solutions**:
```bash
# Check current connections
docker compose exec postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Increase connection limit
# Add to postgres environment:
# POSTGRES_CONFIG_max_connections: 200
```

#### Database Permission Issues

**Symptoms**:
```
ERROR: permission denied for database servarr
ERROR: role "sonarr" does not exist
```

**Solutions**:
```sql
-- Connect to PostgreSQL and check users
\du

-- Create missing user
CREATE USER sonarr WITH PASSWORD 'password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE servarr TO sonarr;
```

### 7. Performance Issues

#### Slow Startup Times

**Common Causes**:
- Large configuration files
- Slow database connections
- Network latency between services

**Solutions**:
```bash
# Reduce reconciliation frequency
CONFIG_RECONCILE_INTERVAL=300

# Optimize PostgreSQL configuration
# Add to postgres environment:
shared_buffers=256MB
max_connections=100
```

#### High Memory Usage

**Monitoring**:
```bash
# Docker stats
docker stats sonarr-sidecar

# Kubernetes
kubectl top pods
```

**Solutions**:
```yaml
# Add resource limits
resources:
  limits:
    memory: 256Mi
    cpu: 200m
  requests:
    memory: 128Mi
    cpu: 100m
```

## Debugging Tips

### Enable Debug Logging

```bash
# Docker Compose
LOG_LEVEL=debug docker compose up -d sonarr-sidecar

# Kubernetes
kubectl set env deployment/sonarr LOG_LEVEL=debug -c preparr-sidecar
```

### Export Configuration State

```bash
# Dump current Servarr configuration
curl -H "X-Api-Key: api-key" http://sonarr:8989/api/v3/config > current-config.json

# Compare with desired state
diff desired-config.json current-config.json
```

### Manual Configuration Testing

```bash
# Test specific API endpoints
curl -H "X-Api-Key: api-key" http://sonarr:8989/api/v3/qualityprofile
curl -H "X-Api-Key: api-key" http://sonarr:8989/api/v3/indexer
curl -H "X-Api-Key: api-key" http://sonarr:8989/api/v3/downloadclient

# Test connectivity between services
docker compose exec sonarr-sidecar curl -f http://sonarr:8989/api/v3/system/status
```

## Getting Help

### Information to Collect

When reporting issues, include:

1. **Environment details**:
   - Docker Compose or Kubernetes
   - PrepArr version/image tag
   - Host operating system

2. **Configuration**:
   - Sanitized environment variables
   - JSON configuration (remove sensitive data)
   - docker-compose.yml or K8s manifests

3. **Logs**:
   - Init container logs
   - Sidecar container logs
   - Servarr application logs
   - PostgreSQL logs (if relevant)

4. **Error details**:
   - Exact error messages
   - When the error occurs
   - Steps to reproduce

### Log Collection Commands

```bash
# Docker Compose - collect all logs
docker compose logs > preparr-logs.txt

# Kubernetes - collect pod logs
kubectl logs deployment/sonarr -c preparr-sidecar > sidecar-logs.txt
kubectl logs deployment/sonarr -c preparr-init > init-logs.txt

# System information
docker compose config > docker-config.yaml
kubectl describe pod sonarr-xxx > pod-description.txt
```

### Support Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community support
- **Discord**: Real-time community help (link in README)

## Prevention

### Best Practices

1. **Test in staging** before production deployment
2. **Use health checks** in all orchestrators
3. **Monitor resource usage** and set appropriate limits
4. **Validate configurations** before deployment
5. **Keep backups** of PostgreSQL database
6. **Use version pinning** for container images
7. **Implement proper logging** and monitoring
8. **Document customizations** and configurations

### Monitoring Setup

```bash
# Add health check endpoints
curl http://preparr:9001/health
curl http://preparr:9001/ready
curl http://preparr:9001/metrics  # If Prometheus enabled
```

### Regular Maintenance

- Update container images regularly
- Rotate API keys and passwords
- Review and optimize configurations
- Monitor disk usage and clean up logs
- Test disaster recovery procedures

---

Still having issues? Check our [Configuration Reference](configuration.md) or reach out via [GitHub Issues](https://github.com/robbeverhelst/preparr/issues).