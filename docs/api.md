# Tetracube API Documentation

## Overview

Tetracube is a modular TypeScript framework providing various core functionalities including runtime management, data storage, policy enforcement, and more.

## Core Modules

### Runtime
The Runtime module manages the application lifecycle.

```typescript
import { Runtime } from './core/runtime';

const runtime = new Runtime();
runtime.start();
```

### Store
The Store module provides data management capabilities.

```typescript
import { Store } from './core/store';

const store = new Store();
store.set('key', 'value');
const value = store.get('key');
```

### Policy DSL
Define and evaluate policies using the PolicyDsl module.

```typescript
import { PolicyDsl } from './core/policyDsl';

const policyDsl = new PolicyDsl();
policyDsl.definePolicy({
  name: 'access-policy',
  rules: [{ condition: 'user.role === "admin"', action: 'allow' }]
});
```

## Modules

### Connector
- **ExternalSync**: Synchronize with external systems
- **ConnectorPrimitive**: Basic connection operations

### Cortex
- **Keymaster**: Key management and generation
- **Instantiate**: Object instantiation utilities
- **Simulate**: Simulation operations

### Enforcer
- **Gatekeeper**: Access control
- **Enforcer**: Policy enforcement
- **EnforcerV2**: Enhanced policy enforcement

## HTTP

### AdminHttpAdapter
Handle HTTP requests for administrative operations.

```typescript
import { AdminHttpAdapter } from './http/adminHttpAdapter';

const adapter = new AdminHttpAdapter();
const response = adapter.handle({
  method: 'GET',
  path: '/admin/users'
});
```

## Extended Modules

### Material
- **MaterialTemplate**: Template management
- **GrainGenerator**: Generate grains for processing

### Natural Language
- **NlParser**: Parse natural language queries
- **SemanticGrounding**: Ground text to semantic concepts

## License

MIT License - See LICENSE file for details.
