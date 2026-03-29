# CogniMesh Developer Guide

Welcome to the CogniMesh Developer Guide! This comprehensive documentation covers everything you need to develop, extend, and integrate with the CogniMesh platform.

## What's Inside

| Document | Description | Audience |
|----------|-------------|----------|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Development setup, project structure, and running tests | New contributors |
| [DOMAIN_DEVELOPMENT.md](./DOMAIN_DEVELOPMENT.md) | Creating domains, repository pattern, and service layer | Backend developers |
| [PLUGIN_DEVELOPMENT.md](./PLUGIN_DEVELOPMENT.md) | Building plugins with the Plugin SDK | Extension developers |
| [TESTING.md](./TESTING.md) | Testing patterns, coverage, and best practices | All developers |
| [API_CLIENT.md](./API_CLIENT.md) | Using the JavaScript SDK for API integration | Frontend/Integration developers |

## Quick Links

### For New Contributors

1. Read [GETTING_STARTED.md](./GETTING_STARTED.md) to set up your environment
2. Review [TESTING.md](./TESTING.md) to understand our testing approach
3. Check out existing code in `src/domains/` for examples

### For Domain Developers

1. Read [DOMAIN_DEVELOPMENT.md](./DOMAIN_DEVELOPMENT.md)
2. Study existing domains in `src/domains/`
3. Review `src/db/repositories/base-repository.js` for data access patterns

### For Plugin Developers

1. Read [PLUGIN_DEVELOPMENT.md](./PLUGIN_DEVELOPMENT.md)
2. Review the Plugin SDK at `src/plugins/plugin-sdk.js`
3. Check examples in `examples/plugins/`

### For API Integration

1. Read [API_CLIENT.md](./API_CLIENT.md)
2. Review the API client at `src/dashboard/public/components/api-client.js`
3. See the full API reference in [API_REFERENCE.md](../../API_REFERENCE.md)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  CLI  │  Desktop  │  VS Code  │  Web Dashboard  │  MCP Clients   │
└───────┴───────────┴───────────┴─────────────────┴────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API LAYER                                 │
│  HTTP API  │  WebSocket  │  MCP Tools  │  Plugin API             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BUSINESS LAYER                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │ Company │ │  Tasks  │ │Workflows│ │ Roadmaps│ │   GSD    │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └──────────┘  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │ Context │ │  Merkle │ │  Skills │ │ Issues  │ │Approvals │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
│  SQLite  │  Repositories  │  Migrations  │  Backup/Restore      │
└─────────────────────────────────────────────────────────────────┘
```

## Development Workflow

```
1. Setup → 2. Code → 3. Test → 4. Document → 5. Submit
    │          │         │           │            │
    ▼          ▼         ▼           ▼            ▼
  Install    Follow    Run unit    Update      Create
  deps       style     tests       docs        PR
  & verify   guide     & check                 to develop
             & lint    coverage
```

## Code Conventions

- **Language**: ES Modules (ES2022+)
- **Style**: Modified Airbnb JavaScript Style Guide
- **Documentation**: JSDoc for all public APIs
- **Testing**: Node.js built-in test runner (`node:test`)
- **Commits**: Conventional Commits specification

## Project Statistics

- **Languages**: JavaScript (Node.js)
- **Lines of Code**: ~50,000+
- **Test Files**: 98+
- **Domains**: 14 business domains
- **API Endpoints**: 100+
- **Plugins**: Extensible plugin system

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for:
- Code of conduct
- Pull request process
- Commit message conventions
- Security guidelines

## Resources

- [Architecture Guide](../../ARCHITECTURE.md) - System design overview
- [API Reference](../../API_REFERENCE.md) - Complete API documentation
- [Deployment Guide](../../DEPLOYMENT.md) - Production deployment
- [GitHub Repository](https://github.com/LastEld/Ckamal)

## Support

- 💬 [GitHub Discussions](https://github.com/cognimesh/cognimesh/discussions)
- 🐛 [Issue Tracker](https://github.com/cognimesh/cognimesh/issues)
- 📧 [Email](mailto:contributors@cognimesh.io)

---

**CogniMesh v5.0** - Multi-model AI orchestration, subscription-first.
