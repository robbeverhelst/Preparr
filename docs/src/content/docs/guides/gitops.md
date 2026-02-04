---
title: GitOps Workflow
description: Version control your Servarr configuration with Git-based workflows
---

PrepArr's declarative configuration model makes it a natural fit for GitOps. Store your config files in Git, and changes are applied automatically.

## Repository Structure

```
media-stack/
├── docker-compose.yml
├── configs/
│   ├── sonarr-config.json
│   ├── radarr-config.json
│   ├── prowlarr-config.json
│   └── qbittorrent-config.json
├── .env                        # Secrets (not committed)
└── .gitignore
```

### .gitignore

```
.env
*.env.local
```

### .env

```bash
POSTGRES_PASSWORD=your-secure-password
SERVARR_ADMIN_PASSWORD=your-admin-password
```

## Docker Compose GitOps

1. Store `docker-compose.yml` and config files in a Git repository
2. Mount config files as read-only volumes
3. Set `CONFIG_WATCH=true` on sidecars
4. To deploy changes: `git pull && docker compose restart`

The sidecar detects file changes and applies them automatically. For changes that require a full restart (like database settings), use `docker compose down && docker compose up -d`.

## Kubernetes GitOps

### With ArgoCD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: media-stack
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/your-org/media-stack.git
    targetRevision: HEAD
    path: kubernetes/
  destination:
    server: https://kubernetes.default.svc
    namespace: media-stack
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

### With Flux

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: media-stack
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/your-org/media-stack.git
  ref:
    branch: main
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: media-stack
  namespace: flux-system
spec:
  interval: 5m
  sourceRef:
    kind: GitRepository
    name: media-stack
  path: ./kubernetes
  prune: true
```

## Environment-Specific Configs

Use separate config files or overlays for different environments:

```
configs/
├── base/
│   ├── sonarr-config.json
│   └── radarr-config.json
├── dev/
│   └── sonarr-config.json    # Overrides for dev
└── prod/
    └── sonarr-config.json    # Overrides for prod
```

## Secret Management

- **Docker Compose**: Use `.env` files (not committed to Git)
- **Kubernetes**: Use Kubernetes Secrets or sealed-secrets
- **Vault**: Use external secret operators to inject secrets into pods

Never commit passwords, API keys, or other secrets to Git.

## CI/CD Validation

Add a validation step to your CI pipeline:

```yaml
# .github/workflows/validate.yml
name: Validate Configs
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Validate JSON syntax
        run: |
          for f in configs/*.json; do
            python3 -m json.tool "$f" > /dev/null || exit 1
          done
```
