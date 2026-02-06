## [0.18.3](https://github.com/robbeverhelst/Preparr/compare/v0.18.2...v0.18.3) (2026-02-06)


### Bug Fixes

* **bazarr:** add audio_only_include field to language profiles ([#67](https://github.com/robbeverhelst/Preparr/issues/67)) ([1028e4f](https://github.com/robbeverhelst/Preparr/commit/1028e4fe46d56839ed98c4218e45b93747adaaf6))

## [0.18.2](https://github.com/robbeverhelst/Preparr/compare/v0.18.1...v0.18.2) (2026-02-06)


### Bug Fixes

* **bazarr:** send individual requests for profile assignment to avoid server 500 ([#64](https://github.com/robbeverhelst/Preparr/issues/64)) ([01b9a65](https://github.com/robbeverhelst/Preparr/commit/01b9a6573fb18cc05784c89bb440c424bf612529)), closes [#63](https://github.com/robbeverhelst/Preparr/issues/63)

## [0.18.1](https://github.com/robbeverhelst/Preparr/compare/v0.18.0...v0.18.1) (2026-02-06)


### Bug Fixes

* **bazarr:** use correct API format for bulk profile assignment ([#62](https://github.com/robbeverhelst/Preparr/issues/62)) ([f16fd8a](https://github.com/robbeverhelst/Preparr/commit/f16fd8a32af43804ce7914808282d8271a22c95a))

# [0.18.0](https://github.com/robbeverhelst/Preparr/compare/v0.17.1...v0.18.0) (2026-02-06)


### Features

* **bazarr:** add default profile flag and bulk media assignment ([#60](https://github.com/robbeverhelst/Preparr/issues/60)) ([5dcde2e](https://github.com/robbeverhelst/Preparr/commit/5dcde2ec16260ea6a6393dfd070b11e5ba45ad91)), closes [#59](https://github.com/robbeverhelst/Preparr/issues/59)

## [0.17.1](https://github.com/robbeverhelst/Preparr/compare/v0.17.0...v0.17.1) (2026-02-06)


### Bug Fixes

* **bazarr:** write provider credentials and enable default profiles ([#58](https://github.com/robbeverhelst/Preparr/issues/58)) ([1fbea51](https://github.com/robbeverhelst/Preparr/commit/1fbea5121b5b6194880ea0268d841998245cea2f)), closes [#57](https://github.com/robbeverhelst/Preparr/issues/57)

# [0.17.0](https://github.com/robbeverhelst/Preparr/compare/v0.16.0...v0.17.0) (2026-02-06)


### Features

* **bazarr:** Add language profiles support ([#56](https://github.com/robbeverhelst/Preparr/issues/56)) ([b57b70d](https://github.com/robbeverhelst/Preparr/commit/b57b70d51c70bbadf4da165f1e75d573e5a0bfad)), closes [#55](https://github.com/robbeverhelst/Preparr/issues/55)

# [0.16.0](https://github.com/robbeverhelst/Preparr/compare/v0.15.0...v0.16.0) (2026-02-05)


### Features

* **bazarr:** Add Bazarr support to PrepArr ([#48](https://github.com/robbeverhelst/Preparr/issues/48)) ([d21bf3e](https://github.com/robbeverhelst/Preparr/commit/d21bf3eb0db80a78e5ff3c3d1b4a91627053ae7a)), closes [#47](https://github.com/robbeverhelst/Preparr/issues/47)
* migrate Helm chart distribution to OCI registry ([#51](https://github.com/robbeverhelst/Preparr/issues/51)) ([a42e6d4](https://github.com/robbeverhelst/Preparr/commit/a42e6d4a9aa41766858f586adef95d25f6d9055b))

# [0.15.0](https://github.com/robbeverhelst/Preparr/compare/v0.14.0...v0.15.0) (2026-02-04)


### Features

* add custom formats and media management support ([#46](https://github.com/robbeverhelst/Preparr/issues/46)) ([71694f3](https://github.com/robbeverhelst/Preparr/commit/71694f3b7c5552c9e820e1d11f4e906e79335881)), closes [#44](https://github.com/robbeverhelst/Preparr/issues/44)

# [0.14.0](https://github.com/robbeverhelst/Preparr/compare/v0.13.2...v0.14.0) (2026-02-04)


### Features

* **ci:** add Kubernetes E2E testing workflow ([#45](https://github.com/robbeverhelst/Preparr/issues/45)) ([b480d89](https://github.com/robbeverhelst/Preparr/commit/b480d89bd1308043bcf36b057769fd8dcb4768c4))

## [0.13.2](https://github.com/robbeverhelst/Preparr/compare/v0.13.1...v0.13.2) (2026-01-27)


### Bug Fixes

* **ci:** add Node.js 22 setup for semantic-release compatibility ([#41](https://github.com/robbeverhelst/Preparr/issues/41)) ([56a825d](https://github.com/robbeverhelst/Preparr/commit/56a825de8ffe204a4ef4e81bbbf81b0f47061949))

## [0.13.1](https://github.com/robbeverhelst/Preparr/compare/v0.13.0...v0.13.1) (2026-01-27)


### Bug Fixes

* improve type compatibility for newer type definitions ([#35](https://github.com/robbeverhelst/Preparr/issues/35)) ([21290b0](https://github.com/robbeverhelst/Preparr/commit/21290b0a1d59bb9b1f8847c780e5202742d49fe3))

# [0.13.0](https://github.com/robbeverhelst/Preparr/compare/v0.12.0...v0.13.0) (2026-01-27)


### Features

* **postgres:** add POSTGRES_SKIP_PROVISIONING option ([dee5322](https://github.com/robbeverhelst/Preparr/commit/dee53220d749c04ee883256d4b5214f8a1f1fc1a))
* **postgres:** add POSTGRES_SKIP_PROVISIONING option ([5fe502d](https://github.com/robbeverhelst/Preparr/commit/5fe502d9cabd665a5dd4eb47d63ab6b558f2ce57)), closes [#24](https://github.com/robbeverhelst/Preparr/issues/24)

# [0.12.0](https://github.com/robbeverhelst/Preparr/compare/v0.11.0...v0.12.0) (2025-11-19)


### Features

* **config:** add authenticationMethod to defaults and update envMapping ([2112f1c](https://github.com/robbeverhelst/Preparr/commit/2112f1c701684c2a9f09b4b14909688e72edf65f))
* **servarr:** add authenticationMethod to configuration schema and update client handling ([5f0fb57](https://github.com/robbeverhelst/Preparr/commit/5f0fb57710f2f5721ba4a5fc24646004c6022e98))

# [0.11.0](https://github.com/robbeverhelst/Preparr/compare/v0.10.0...v0.11.0) (2025-11-14)


### Features

* **qbittorrent:** add configStorage options and update initialization logic ([677cc77](https://github.com/robbeverhelst/Preparr/commit/677cc77a9517b66f9d193ace678aa8894211d392))

# [0.10.0](https://github.com/robbeverhelst/Preparr/compare/v0.9.0...v0.10.0) (2025-11-14)


### Features

* **qbittorrent:** add downloadsPath configuration and update initialization logic ([6f5b54f](https://github.com/robbeverhelst/Preparr/commit/6f5b54fc37350ec3046f0ad17ae1461367d48cee))

# [0.9.0](https://github.com/robbeverhelst/Preparr/compare/v0.8.0...v0.9.0) (2025-11-14)


### Features

* **helm:** add support for extra volume mounts and containers in radarr template ([e8ca0c8](https://github.com/robbeverhelst/Preparr/commit/e8ca0c8ca27d10b73def633d21389d0ca1744619))

# [0.8.0](https://github.com/robbeverhelst/Preparr/compare/v0.7.4...v0.8.0) (2025-11-14)


### Features

* **helm:** add pod annotations support for prowlarr, qbittorrent, and radarr templates ([461f5bb](https://github.com/robbeverhelst/Preparr/commit/461f5bb0cc817c95f1378883025187d830d9b2a5))

## [0.7.4](https://github.com/robbeverhelst/Preparr/compare/v0.7.3...v0.7.4) (2025-11-14)


### Bug Fixes

* **postgres:** simplify implementation name handling in PostgresClient ([b4a6a18](https://github.com/robbeverhelst/Preparr/commit/b4a6a18d93394798d170fe76cd02f35f58555acd))

## [0.7.3](https://github.com/robbeverhelst/Preparr/compare/v0.7.2...v0.7.3) (2025-11-14)


### Bug Fixes

* **postgres:** enhance PostgresClient to improve implementation name handling and normalize sync level values ([ff9e3d6](https://github.com/robbeverhelst/Preparr/commit/ff9e3d6eb6e84a61e8aab66acc12a8f7f1483c5d))

## [0.7.2](https://github.com/robbeverhelst/Preparr/compare/v0.7.1...v0.7.2) (2025-11-14)


### Bug Fixes

* **applications:** streamline readCurrentState method to prioritize database retrieval for applications ([219bc65](https://github.com/robbeverhelst/Preparr/commit/219bc65a3efba35fe48ad8ceb8807c31eb8c32f3))

## [0.7.1](https://github.com/robbeverhelst/Preparr/compare/v0.7.0...v0.7.1) (2025-11-14)


### Bug Fixes

* **postgres:** enhance PostgresClient to support environment-based database configuration and improve application field mapping ([5b95ca9](https://github.com/robbeverhelst/Preparr/commit/5b95ca9c1e1b1058c10ea0e41c26a22d5cb19729))

# [0.7.0](https://github.com/robbeverhelst/Preparr/compare/v0.6.2...v0.7.0) (2025-11-13)


### Features

* **postgres:** add getApplicationsTable method to retrieve application data from the database ([a451cee](https://github.com/robbeverhelst/Preparr/commit/a451cee094acd36590cd878dd75fef3dc24740d0))

## [0.6.2](https://github.com/robbeverhelst/Preparr/compare/v0.6.1...v0.6.2) (2025-11-13)


### Bug Fixes

* add secret field filtering to application field mapping ([bbafc20](https://github.com/robbeverhelst/Preparr/commit/bbafc20504d4fb8a2edfe464af3b4f0732004053))

## [0.6.1](https://github.com/robbeverhelst/Preparr/compare/v0.6.0...v0.6.1) (2025-11-13)


### Bug Fixes

* improve field normalization and matching logic for applications ([c919443](https://github.com/robbeverhelst/Preparr/commit/c919443e973aa4e27ec970c56976192b0fcd3837))

# [0.6.0](https://github.com/robbeverhelst/Preparr/compare/v0.5.0...v0.6.0) (2025-11-13)


### Features

* **servarr:** enhance application management by adding update functionality and matching logic ([6c58d05](https://github.com/robbeverhelst/Preparr/commit/6c58d053bc256b9b6979ac6fd8a1c44df87080c0))

# [0.5.0](https://github.com/robbeverhelst/Preparr/compare/v0.4.1...v0.5.0) (2025-11-13)


### Features

* **qbittorrent:** add support for extra volume mounts and volumes in Helm template ([b2d1616](https://github.com/robbeverhelst/Preparr/commit/b2d16161c9548f513725c5d64d670022908b2b93))

## [0.4.1](https://github.com/robbeverhelst/Preparr/compare/v0.4.0...v0.4.1) (2025-11-13)


### Bug Fixes

* **radarr:** update Radarr admin user configuration to use dynamic username from values ([18e6749](https://github.com/robbeverhelst/Preparr/commit/18e67493a20a3ecd72299c884a48ec29aeb466a9))

# [0.4.0](https://github.com/robbeverhelst/Preparr/compare/v0.3.3...v0.4.0) (2025-11-12)


### Bug Fixes

* add error handling for user renaming in ServarrManager ([9c07446](https://github.com/robbeverhelst/Preparr/commit/9c07446b86add66bfbb29e9b21e7c919fdeebac0))


### Features

* enhance admin user management by renaming existing users to match desired username ([af82c1f](https://github.com/robbeverhelst/Preparr/commit/af82c1f36e55e84e9300c30a36d578b04fe9563f))

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
