# Production-Grade Helm Chart Features

This document describes all production-ready features added to the PrepArr Helm chart.

## Phase 1: Critical Production Features ✅

### 1. Global Configuration

```yaml
global:
  namespace: preparr
  imagePullSecrets:
    - my-registry-secret
  labels:
    environment: production
    team: platform
  annotations:
    owner: platform-team
  storageClass: "fast-ssd"
```

**Benefits:**
- Consistent configuration across all services
- Easy multi-environment deployments
- Centralized secret management

### 2. Secret Management

```yaml
sonarr:
  auth:
    existingSecret: "sonarr-credentials"
    secretKeys:
      adminPasswordKey: "admin-password"
      apiKeyKey: "api-key"
```

**Benefits:**
- Use pre-created Kubernetes secrets
- Integration with external secret managers (Vault, AWS Secrets Manager, etc.)
- No plain-text passwords in values files
- Compliance with security standards

### 3. Ingress Support

```yaml
sonarr:
  ingress:
    enabled: true
    className: nginx
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
      nginx.ingress.kubernetes.io/auth-type: basic
    hosts:
      - host: sonarr.example.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: sonarr-tls
        hosts:
          - sonarr.example.com
```

**Benefits:**
- Production-ready HTTPS endpoints
- Automatic TLS cert management with cert-manager
- Custom annotations for authentication, rate limiting, etc.
- Multi-host support

### 4. Security Contexts

```yaml
sonarr:
  podSecurityContext:
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000

  securityContext:
    allowPrivilegeEscalation: false
    runAsNonRoot: true
    capabilities:
      drop:
        - ALL
```

**Benefits:**
- Run containers as non-root
- Drop unnecessary capabilities
- Pass security audits and compliance checks
- Prevent container breakouts

### 5. Extra Containers & Volumes

**Metrics Exporter Sidecar:**
```yaml
qbittorrent:
  extraContainers:
    - name: metrics-exporter
      image: ghcr.io/esanchezm/qbittorrent-exporter:latest
      ports:
        - containerPort: 9022
      env:
        - name: QBITTORRENT_HOST
          value: "localhost"
```

**NFS Storage:**
```yaml
sonarr:
  extraVolumes:
    - name: tv-storage
      nfs:
        server: nfs.example.com
        path: /media/tv
    - name: downloads
      nfs:
        server: nfs.example.com
        path: /downloads

  extraVolumeMounts:
    - name: tv-storage
      mountPath: /tv
    - name: downloads
      mountPath: /downloads
```

**Wait-for-DB Init Container:**
```yaml
sonarr:
  initContainers:
    - name: wait-for-db
      image: busybox:1.35
      command:
        - 'sh'
        - '-c'
        - 'until nc -z postgres 5432; do sleep 2; done'
```

**Benefits:**
- Add monitoring/metrics exporters
- Use shared NFS storage
- Custom init logic
- Flexible deployment patterns

### 6. Service Customization

```yaml
sonarr:
  service:
    type: LoadBalancer  # or ClusterIP, NodePort
    annotations:
      service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    labels:
      monitoring: "enabled"
    loadBalancerIP: "10.0.0.100"
    loadBalancerSourceRanges:
      - "10.0.0.0/8"
    externalTrafficPolicy: "Local"
```

**Benefits:**
- Cloud provider integrations (AWS NLB, GCP LB, etc.)
- IP whitelisting
- Service mesh compatibility
- Custom routing policies

### 7. Advanced Scheduling

**Node Selection:**
```yaml
sonarr:
  nodeSelector:
    disktype: ssd
```

**Tolerations:**
```yaml
sonarr:
  tolerations:
    - key: "media-workload"
      operator: "Equal"
      value: "true"
      effect: "NoSchedule"
```

**Anti-Affinity:**
```yaml
sonarr:
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchExpressions:
                - key: app
                  operator: In
                  values:
                    - sonarr
            topologyKey: kubernetes.io/hostname
```

**Benefits:**
- Deploy to specific node types
- High availability across zones
- Resource optimization
- Avoid noisy neighbors

### 8. Environment Variables

**Additional Env Vars:**
```yaml
sonarr:
  extraEnv:
    - name: CUSTOM_VAR
      value: "custom_value"
```

**Load from ConfigMap/Secret:**
```yaml
sonarr:
  envFrom:
    - configMapRef:
        name: sonarr-env-config
    - secretRef:
        name: sonarr-secrets
```

**Benefits:**
- Flexible configuration
- Separate config from code
- Easy updates without redeployment

### 9. Custom Probes & Lifecycle

**Startup Probe (for slow-starting apps):**
```yaml
sonarr:
  startupProbe:
    httpGet:
      path: /api/v3/system/status
      port: 8989
    failureThreshold: 30
    periodSeconds: 10
```

**Graceful Shutdown:**
```yaml
sonarr:
  lifecycle:
    preStop:
      exec:
        command: ["/bin/sh", "-c", "sleep 15"]
```

**Benefits:**
- Prevent premature restarts
- Graceful connection draining
- Better reliability

### 10. Deployment Strategy

```yaml
sonarr:
  replicaCount: 2

  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

**Benefits:**
- Zero-downtime deployments
- Controlled rollout
- Quick rollback capability

### 11. Pod Customization

```yaml
sonarr:
  podAnnotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "9001"

  podLabels:
    app.kubernetes.io/component: media-manager

  priorityClassName: "high-priority"
```

**Benefits:**
- Prometheus auto-discovery
- Custom monitoring labels
- Pod priority for resource contention

## Usage Examples

### Example 1: Production Deployment with Ingress

```bash
helm install media-stack ./helm/preparr \
  -f helm/preparr/examples/production-advanced-values.yaml
```

### Example 2: Using Existing Secrets

```bash
# Create secrets first
kubectl create secret generic sonarr-creds \
  --from-literal=admin-password='mypassword' \
  --from-literal=api-key='myapikey'

# Deploy with existing secret
helm install media-stack ./helm/preparr \
  --set sonarr.auth.existingSecret=sonarr-creds
```

### Example 3: Custom NFS Storage

```yaml
sonarr:
  storage:
    tv:
      enabled: false  # Disable PVC

  extraVolumes:
    - name: tv-nfs
      nfs:
        server: nfs.example.com
        path: /media/tv

  extraVolumeMounts:
    - name: tv-nfs
      mountPath: /tv
```

## Testing

```bash
# Lint the chart
helm lint ./helm/preparr

# Dry run to see what will be deployed
helm install test-stack ./helm/preparr --dry-run --debug

# Template with custom values
helm template test-stack ./helm/preparr \
  -f helm/preparr/examples/production-advanced-values.yaml > output.yaml

# Validate all examples
for f in helm/preparr/examples/*.yaml; do
  echo "Testing $f..."
  helm template test ./helm/preparr -f "$f" > /dev/null && echo "✓ Valid"
done
```

## Future Enhancements (Phase 2 & 3)

- ServiceAccount & RBAC
- Network Policies
- PodDisruptionBudget for HA
- Prometheus ServiceMonitor CRD
- Horizontal Pod Autoscaler
- Custom Resource Definitions
- Operator pattern support

## Migration from Raw Manifests

If upgrading from the old raw k8s manifests:

```bash
# 1. Export current config
kubectl get deployment sonarr -n preparr-test -o yaml > backup.yaml

# 2. Clean up old deployment
kubectl delete namespace preparr-test

# 3. Deploy with Helm
helm install media-stack ./helm/preparr \
  -f your-custom-values.yaml
```

## Contributing

When adding new services or features, ensure:

1. Add all production fields to values.yaml
2. Support `existingSecret` for credentials
3. Include ingress configuration
4. Add security contexts
5. Support extra containers/volumes
6. Document in this file
7. Add example in `examples/` directory
8. Test with `helm lint` and `helm template`
