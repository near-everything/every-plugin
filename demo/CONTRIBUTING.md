# Contributing Guide

Thank you for contributing to the NEAR Merch Store! 🎉

## Quick Setup

```bash
bun install              # Install dependencies
bun db:migrate           # Run database migrations
bun dev                  # Start all services
```

Visit http://localhost:3001 to see the application.

**Need more details?** See [README.md](./README.md) for architecture overview and [LLM.txt](./LLM.txt) for technical deep-dive.

## Development Workflow

### Making Changes

- **UI Changes**: Edit `ui/src/` → hot reload automatically → deploy with `bun build:ui`
- **API Changes**: Edit `api/src/` → hot reload automatically → deploy with `bun build:api`
- **Host Changes**: Edit `host/src/` or `bos.config.json` → deploy with `bun build:host`

### Environment Configuration

All runtime URLs are configured in `bos.config.json` - no rebuild needed! Switch environments:

```bash
NODE_ENV=development bun dev:host  # Use local services (default)
NODE_ENV=production bun dev:host   # Use production CDN URLs
```

Secrets go in `.env` (see [.env.example](./.env.example) for required variables).

### Project Documentation

- **[README.md](./README.md)** - Architecture, tech stack, and quick start
- **[LLM.txt](./LLM.txt)** - Technical guide for LLMs and developers
- **[api/README.md](./api/README.md)** - API plugin documentation
- **[api/LLM.txt](./api/LLM.txt)** - Plugin development guide (every-plugin)
- **[ui/README.md](./ui/README.md)** - Frontend documentation
- **[host/README.md](./host/README.md)** - Server host documentation

## Contributing Code

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
3. **Create** a feature branch: `git checkout -b feature/amazing-feature`
4. **Make** your changes
5. **Test** thoroughly: `bun test` and `bun typecheck`
6. **Commit** using [Semantic Commits](https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716)
7. **Push** to your fork: `git push origin feature/amazing-feature`
8. **Open** a Pull Request to the main repository

### Code Style

- Follow existing TypeScript patterns and conventions
- Ensure type safety (no `any` types unless absolutely necessary)
- Write descriptive commit messages
- Add tests for new features

## Reporting Issues

Use [GitHub Issues](https://github.com/NEARBuilders/near-merch-store/issues) with:

- **Clear description** of the problem
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Environment details** (OS, Node/Bun version, browser, etc.)

## Getting Help

- Check the [README](./README.md) for architecture and setup
- Read the [LLM.txt](./LLM.txt) for technical details
- Review workspace READMEs for specific documentation
- Ask questions in GitHub Issues or Discussions

---

Thank you for your contributions! 💚
