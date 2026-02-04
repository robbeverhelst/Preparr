import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://robbeverhelst.github.io',
  base: '/Preparr',
  integrations: [
    starlight({
      title: 'PrepArr',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/robbeverhelst/Preparr' },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'index' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
            { label: 'Concepts', slug: 'getting-started/concepts' },
          ],
        },
        {
          label: 'Deployment',
          items: [
            { label: 'Docker Compose', slug: 'deployment/docker-compose' },
            { label: 'Kubernetes', slug: 'deployment/kubernetes' },
            { label: 'Helm Chart', slug: 'deployment/helm' },
          ],
        },
        {
          label: 'Configuration',
          items: [
            { label: 'Overview', slug: 'configuration/overview' },
            { label: 'Environment Variables', slug: 'configuration/environment-variables' },
            { label: 'Root Folders', slug: 'configuration/root-folders' },
            { label: 'Quality Profiles', slug: 'configuration/quality-profiles' },
            { label: 'Custom Formats', slug: 'configuration/custom-formats' },
            { label: 'Download Clients', slug: 'configuration/download-clients' },
            { label: 'Indexers', slug: 'configuration/indexers' },
            { label: 'Media Management', slug: 'configuration/media-management' },
            { label: 'Naming', slug: 'configuration/naming' },
            { label: 'Validation', slug: 'configuration/validation' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Multi-Service Stack', slug: 'guides/multi-service-stack' },
            { label: 'Prowlarr Sync', slug: 'guides/prowlarr-sync' },
            { label: 'GitOps Workflow', slug: 'guides/gitops' },
            { label: 'Production Checklist', slug: 'guides/production' },
            { label: 'Monitoring & Health', slug: 'guides/monitoring' },
            { label: 'Migrating to PrepArr', slug: 'guides/migration' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'JSON Schema', slug: 'reference/json-schema' },
            { label: 'CLI Flags', slug: 'reference/cli' },
            { label: 'Health Endpoints', slug: 'reference/health-endpoints' },
            { label: 'Helm Values', slug: 'reference/helm-values' },
            { label: 'Examples', slug: 'reference/examples' },
          ],
        },
        { label: 'Troubleshooting', slug: 'troubleshooting' },
        { label: 'Contributing', slug: 'contributing' },
      ],
    }),
  ],
})
