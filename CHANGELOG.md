## [0.3.3](https://github.com/robbeverhelst/Preparr/compare/v0.3.2...v0.3.3) (2025-11-12)


### Bug Fixes

* update admin user configuration in Helm templates for Prowlarr, Radarr, and Sonarr ([b72bc9a](https://github.com/robbeverhelst/Preparr/commit/b72bc9a2be4515900b7b47031b0c6131e87621cf))

## [0.3.2](https://github.com/robbeverhelst/Preparr/compare/v0.3.1...v0.3.2) (2025-10-06)


### Bug Fixes

* update Chart description and README with Helm repository installation ([9e9dd47](https://github.com/robbeverhelst/Preparr/commit/9e9dd47b410a4df6f8f54e6c696b909b98397663))

## [0.3.1](https://github.com/robbeverhelst/Preparr/compare/v0.3.0...v0.3.1) (2025-10-06)


### Bug Fixes

* move ArtifactHub metadata to gh-pages branch root for proper indexing ([54725cf](https://github.com/robbeverhelst/Preparr/commit/54725cff3c2ce04e3cae18170b88a9b1b9a96350))

# [0.3.0](https://github.com/robbeverhelst/Preparr/compare/v0.2.4...v0.3.0) (2025-10-06)


### Features

* add GitHub Pages Helm repository for ArtifactHub compatibility ([c3671d7](https://github.com/robbeverhelst/Preparr/commit/c3671d790e717b10983d1eec37a50e19f0ce7bcf))

## [0.2.4](https://github.com/robbeverhelst/Preparr/compare/v0.2.3...v0.2.4) (2025-10-05)


### Bug Fixes

* remove OCI registry support due to GHCR/Helm incompatibility, use direct .tgz downloads ([3055b80](https://github.com/robbeverhelst/Preparr/commit/3055b80dccb0383d7c63673e9b5c0e1ddafbfdae))

## [0.2.3](https://github.com/robbeverhelst/Preparr/compare/v0.2.2...v0.2.3) (2025-10-05)


### Bug Fixes

* use ORAS to push Helm charts to GHCR for proper OCI manifest generation ([21bad16](https://github.com/robbeverhelst/Preparr/commit/21bad16367522827c6c379c009af51223e4d28c1))

## [0.2.2](https://github.com/robbeverhelst/Preparr/compare/v0.2.1...v0.2.2) (2025-10-05)


### Bug Fixes

* attach Helm chart tgz to releases for direct download and testing [skip ci] ([2b334d5](https://github.com/robbeverhelst/Preparr/commit/2b334d5c123b710d17f1214924d53a3fd5f6037b))
* upgrade Helm to v3.16 and add package visibility management for OCI registry ([421adca](https://github.com/robbeverhelst/Preparr/commit/421adcae5ee3ebda732457610264c7f654db0e7e))

## [0.2.1](https://github.com/robbeverhelst/Preparr/compare/v0.2.0...v0.2.1) (2025-10-05)


### Bug Fixes

* migrate Helm chart publishing to GitHub Container Registry (OCI) ([30f44fe](https://github.com/robbeverhelst/Preparr/commit/30f44fe3bb6ec394081a483cfa4120c5c9c63227))

# [0.2.0](https://github.com/robbeverhelst/Preparr/compare/v0.1.10...v0.2.0) (2025-10-05)


### Features

* add production-grade Helm chart with complete IaC support ([028a0c2](https://github.com/robbeverhelst/Preparr/commit/028a0c2dee9d590742e36786127990eeca1ecf0f))


### BREAKING CHANGES

* k8s deployment now requires Helm 3.8+

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>

## [0.1.10](https://github.com/robbeverhelst/Preparr/compare/v0.1.9...v0.1.10) (2025-10-03)


### Bug Fixes

* clean up JSON configuration formatting and improve logging in configuration loading ([304aca8](https://github.com/robbeverhelst/Preparr/commit/304aca8838891b45f4ad6800c2fb1aef7d6ef39a))
* unify configuration structure and enhance Kubernetes deployment ([aaae5cd](https://github.com/robbeverhelst/Preparr/commit/aaae5cdfbc3c4e05a09d735b50cd78dac6552a22))

## [0.1.9](https://github.com/robbeverhelst/Preparr/compare/v0.1.8...v0.1.9) (2025-09-09)


### Bug Fixes

* enhance user management in Servarr by implementing password hashing and duplicate user checks ([8de5542](https://github.com/robbeverhelst/Preparr/commit/8de554287b9ad4ea1bc3d406565c4a0602d703d5))

## [0.1.8](https://github.com/robbeverhelst/Preparr/compare/v0.1.7...v0.1.8) (2025-09-08)


### Bug Fixes

* improve indexer mapping and logging in Servarr configuration ([68ac163](https://github.com/robbeverhelst/Preparr/commit/68ac163b5b13c9c5ce040d8b4471b245674c37e8))
* prowlarrsync and restructure Docker setup ([7cbb9b9](https://github.com/robbeverhelst/Preparr/commit/7cbb9b95d842ab2ea24faf8afeed38da1bd13542))
