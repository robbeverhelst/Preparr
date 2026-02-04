---
title: Kubernetes
description: Deploy PrepArr with raw Kubernetes manifests using init containers and sidecars
---

For most Kubernetes deployments, the [Helm chart](/Preparr/deployment/helm/) is recommended. This guide covers raw manifest deployment for users who prefer direct control.

## Prerequisites

- Kubernetes 1.19+
- kubectl configured for your cluster
- PostgreSQL (in-cluster or external)

## Manifests

### Namespace and Secret

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: media-stack
---
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: media-stack
type: Opaque
data:
  password: cG9zdGdyZXMxMjM=  # base64 encoded
```

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: sonarr-config
  namespace: media-stack
data:
  sonarr-config.json: |
    {
      "rootFolders": [
        { "path": "/tv", "accessible": true }
      ],
      "qualityProfiles": [
        {
          "name": "HD - 1080p",
          "cutoff": 1080,
          "items": [
            { "quality": { "id": 1, "name": "HDTV-1080p" }, "allowed": true },
            { "quality": { "id": 2, "name": "WEBDL-1080p" }, "allowed": true }
          ]
        }
      ]
    }
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sonarr
  namespace: media-stack
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sonarr
  template:
    metadata:
      labels:
        app: sonarr
    spec:
      initContainers:
      - name: preparr-init
        image: ghcr.io/robbeverhelst/preparr:latest
        command: ["bun", "run", "dist/index.js", "--init"]
        env:
        - name: POSTGRES_HOST
          value: "postgres-service"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: SERVARR_URL
          value: "http://localhost:8989"
        - name: SERVARR_TYPE
          value: "sonarr"
        - name: SERVARR_ADMIN_PASSWORD
          value: "adminpass"
        - name: CONFIG_PATH
          value: "/config/sonarr-config.json"
        volumeMounts:
        - name: sonarr-config-volume
          mountPath: /config
        - name: config-json
          mountPath: /config/sonarr-config.json
          subPath: sonarr-config.json

      containers:
      - name: sonarr
        image: linuxserver/sonarr:latest
        ports:
        - containerPort: 8989
        env:
        - name: PUID
          value: "1000"
        - name: PGID
          value: "1000"
        volumeMounts:
        - name: sonarr-config-volume
          mountPath: /config
        - name: tv-storage
          mountPath: /tv
        livenessProbe:
          httpGet:
            path: /
            port: 8989
          initialDelaySeconds: 60
          periodSeconds: 30

      - name: preparr-sidecar
        image: ghcr.io/robbeverhelst/preparr:latest
        ports:
        - containerPort: 9001
          name: health
        env:
        - name: POSTGRES_HOST
          value: "postgres-service"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: SERVARR_URL
          value: "http://localhost:8989"
        - name: SERVARR_TYPE
          value: "sonarr"
        - name: SERVARR_ADMIN_PASSWORD
          value: "adminpass"
        - name: CONFIG_PATH
          value: "/config/sonarr-config.json"
        - name: CONFIG_WATCH
          value: "true"
        - name: HEALTH_PORT
          value: "9001"
        volumeMounts:
        - name: sonarr-config-volume
          mountPath: /config
        - name: config-json
          mountPath: /config/sonarr-config.json
          subPath: sonarr-config.json
        livenessProbe:
          httpGet:
            path: /health/live
            port: 9001
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 9001
          initialDelaySeconds: 10
          periodSeconds: 10

      volumes:
      - name: sonarr-config-volume
        emptyDir: {}
      - name: config-json
        configMap:
          name: sonarr-config
      - name: tv-storage
        persistentVolumeClaim:
          claimName: tv-pvc
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sonarr-service
  namespace: media-stack
spec:
  selector:
    app: sonarr
  ports:
  - name: http
    port: 8989
    targetPort: 8989
  - name: health
    port: 9001
    targetPort: 9001
```

## Updating Configuration

```bash
# Update the ConfigMap
kubectl apply -f sonarr-configmap.yaml

# Restart the deployment to pick up changes
kubectl rollout restart deployment/sonarr -n media-stack
```

## Common Commands

```bash
# Check pod status
kubectl get pods -n media-stack

# View init container logs
kubectl logs -n media-stack deployment/sonarr -c preparr-init

# View sidecar logs
kubectl logs -n media-stack deployment/sonarr -c preparr-sidecar -f

# Port forward for local access
kubectl port-forward -n media-stack svc/sonarr-service 8989:8989
```
