# Developer Guide Index

## Getting Started
- [Getting Started](./GETTING_STARTED.md) - Development setup and project structure
- [Testing](./TESTING.md) - Testing patterns and coverage

## Development
- [Domain Development](./DOMAIN_DEVELOPMENT.md) - Creating domains and services
- [Plugin Development](./PLUGIN_DEVELOPMENT.md) - Building plugins with the SDK
- [API Client](./API_CLIENT.md) - Using the JavaScript SDK

## Navigation

```
docs/developers/
├── README.md                 # Guide overview
├── index.md                  # This file
├── GETTING_STARTED.md        # Development setup
├── DOMAIN_DEVELOPMENT.md     # Domain development guide
├── PLUGIN_DEVELOPMENT.md     # Plugin development guide
├── TESTING.md                # Testing guide
└── API_CLIENT.md             # API client SDK guide
```

## Quick Reference

### Common Commands

```bash
# Development
npm install           # Install dependencies
npm run dev           # Start dev server with watch
npm start             # Start production server

# Testing
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:coverage # Coverage report

# Code Quality
npm run lint          # Run ESLint
npm run format        # Format with Prettier
npm run bios:diagnose # System diagnostics
```

### Key Files

```
src/
├── domains/index.js         # Domain registry
├── db/repositories/         # Data access layer
├── plugins/plugin-sdk.js    # Plugin SDK
├── dashboard/public/components/api-client.js  # API client
└── bios/                    # BIOS system
```

### Testing Structure

```
tests/
├── unit/                    # Unit tests
├── integration/             # Integration tests
├── e2e/                     # End-to-end tests
├── api/                     # API tests
├── auth/                    # Auth tests
└── domains/                 # Domain tests
```
