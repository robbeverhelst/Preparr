# PrepArr Kubernetes Deployment

Deploy your complete Servarr stack to Kubernetes using the PrepArr Helm chart.

## Quick Start

```bash
# Install with default values
helm install media-stack ./helm/preparr

# Install with custom configuration
helm install media-stack ./helm/preparr -f custom-values.yaml

# Use one of the provided examples
helm install media-stack ./helm/preparr -f helm/preparr/examples/minimal-values.yaml
```

## Available Examples

- **minimal-values.yaml** - Quick start with minimal configuration
- **full-stack-values.yaml** - Complete stack with all features configured
- **production-values.yaml** - Production-ready with persistence and resource limits
- **sonarr-only-values.yaml** - Deploy only Sonarr for testing

See [helm/preparr/README.md](../helm/preparr/README.md) for complete documentation.

## Testing and Development

```bash
# Dry run to see what will be deployed
helm install test-stack ./helm/preparr --dry-run --debug

# Template output to review manifests
helm template test-stack ./helm/preparr > rendered.yaml

# Deploy to test namespace
helm install test-stack ./helm/preparr --namespace preparr-test --create-namespace
```

## Resources

- **Helm Chart**: [helm/preparr/](../helm/preparr/)
- **Chart Documentation**: [helm/preparr/README.md](../helm/preparr/README.md)
- **Example Values**: [helm/preparr/examples/](../helm/preparr/examples/)
