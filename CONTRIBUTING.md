# Contributing to PrepArr

Thank you for your interest in contributing to PrepArr! This guide will help you get started with development.

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh/docs/installation) (latest version)
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [PostgreSQL](https://www.postgresql.org/download/) (for local development)

### Development Setup
```bash
# Clone the repository
git clone https://github.com/robbeverhelst/Preparr.git
cd Preparr

# Install dependencies
bun install

# Run tests
bun test

# Run in development mode with watch
bun run dev

# Build for production
bun run build
```

## 🧪 Testing

### Unit Tests
```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test src/config/index.test.ts
```

### Integration Tests
```bash
# Start test environment
bun run docker:up

# Run integration tests
bun run test:integration

# Clean up
bun run docker:reset
```

## 🏗️ Architecture Overview

PrepArr uses a **three-container pattern** for each Servarr application:

1. **Init Container** (`--init` flag) - Sets up databases and config.xml, then exits
2. **Sidecar Container** (default mode) - Continuously applies JSON configuration
3. **Servarr App** - Standard Linuxserver container using prepared config

### Key Components
- **Configuration Loading** (`src/config/`) - Zod schemas and multi-source config loading
- **Database Management** (`src/postgres/`) - PostgreSQL initialization and user management  
- **Servarr Integration** (`src/servarr/`) - API interactions via Tsarr client
- **Step System** (`src/steps/`) - Modular configuration steps with reconciliation
- **Health Monitoring** (`src/health/`) - Health check endpoints for orchestrators

## 📝 Code Style

### Formatting and Linting
```bash
# Check code style
bun run lint

# Fix auto-fixable issues
bun run lint:fix

# Format code
bun run format

# Type checking
bun run typecheck
```

### Guidelines
- Use TypeScript for all code
- Validate inputs with Zod schemas
- Leverage Bun's native APIs (Bun.file(), Bun.spawn(), etc.)
- Use async/await for all I/O operations
- Follow existing patterns for error handling
- Write tests for new functionality
- Use structured logging with context

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer(s)]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples**:
- `feat(config): add prowlarrSync flag for indexer management`
- `fix(postgres): handle connection timeout gracefully`  
- `docs(readme): update configuration examples`

## 🔧 Development Workflow

### Adding New Features
1. Create feature branch: `git checkout -b feat/your-feature`
2. Write tests first (TDD approach preferred)
3. Implement feature following existing patterns
4. Update documentation as needed
5. Ensure all tests pass and code is formatted
6. Submit pull request with clear description

### Bug Fixes
1. Create issue describing the bug
2. Create bugfix branch: `git checkout -b fix/issue-number`
3. Add test that reproduces the issue
4. Fix the issue while keeping the test passing
5. Submit pull request referencing the issue

### Configuration Changes
- Update Zod schemas in `src/config/schema.ts`
- Add validation tests in `src/config/*.test.ts`
- Update example configs in `examples/`
- Update README.md with new options

## 🐳 Docker Development

### Building Images
```bash
# Build all images
bun run docker:build

# Build specific service
docker build -t preparr:dev .

# Run development stack
bun run docker:up
```

### Testing Changes
```bash
# Reset environment and test changes
bun run docker:reset && bun run docker:up

# Check logs
docker logs preparr-sonarr-sidecar-1

# Inspect running containers
docker ps
```

## 📋 Pull Request Guidelines

### Before Submitting
- [ ] All tests pass (`bun test`)
- [ ] Code is properly formatted (`bun run format`)
- [ ] TypeScript compiles without errors (`bun run typecheck`)
- [ ] Integration tests pass with Docker stack
- [ ] Documentation updated if needed
- [ ] Commit messages follow conventional format

### PR Description Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to break)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or clearly documented)
```

## 🎯 Areas for Contribution

### High Priority
- **Additional Servarr Support** - Lidarr, Readarr implementation
- **Enhanced Error Handling** - Better retry logic and error recovery
- **Kubernetes Examples** - Helm charts and manifest examples
- **Monitoring Integration** - Prometheus metrics exporter

### Medium Priority  
- **Configuration Validation** - More comprehensive Zod schemas
- **Testing Coverage** - Additional integration test scenarios
- **Performance Optimization** - Reduce startup time and memory usage
- **Documentation** - Complete `/docs` directory structure

### Good First Issues
- **Example Configurations** - More example setups for different use cases
- **Error Messages** - Improve error message clarity and actionability
- **Logging Improvements** - Add more structured logging context
- **Code Comments** - Add JSDoc comments to public APIs

## 🛟 Getting Help

- **Issues** - Open a GitHub issue for bugs or feature requests
- **Discussions** - Use GitHub Discussions for questions and ideas
- **Discord** - Join our community Discord (link in README)

## 📄 License

By contributing to PrepArr, you agree that your contributions will be licensed under the MIT License.

---

**Happy Contributing!** 🎉