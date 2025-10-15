# Security Documentation

## Overview

This document outlines the security features and best practices for the Tetracube framework.

## Authentication & Authorization

### Admin RBAC
The AdminRbac module provides role-based access control.

```typescript
import { AdminRbac } from './core/adminRbac';

const rbac = new AdminRbac();
rbac.defineRole({
  name: 'admin',
  permissions: ['read', 'write', 'delete']
});
rbac.assignRole('user123', 'admin');
```

### Gatekeeper
The Gatekeeper module controls access to resources.

```typescript
import { Gatekeeper } from './modules/enforcer/gatekeeper';

const gatekeeper = new Gatekeeper();
gatekeeper.grant('user123', 'resource-1');
const hasAccess = gatekeeper.checkAccess({
  userId: 'user123',
  resource: 'resource-1',
  action: 'read'
});
```

## Credential Management

### Credential Reference
Securely manage credential references without storing actual credentials.

```typescript
import { CredentialRefManager } from './core/credentialRef';

const credManager = new CredentialRefManager();
credManager.store({
  id: 'cred-1',
  type: 'oauth',
  reference: 'vault://credentials/oauth-token'
});
```

## Key Management

### Keymaster
The Keymaster module manages cryptographic keys.

```typescript
import { Keymaster } from './modules/cortex/keymaster';

const keymaster = new Keymaster();
const key = keymaster.generateKey('api-key-1');
```

## Network Security

### Kubernetes Network Policies
Network policies are defined in `infra/k8s/networkpolicy-keymaster.yaml` to restrict traffic between pods.

## Best Practices

1. **Never store credentials in code**: Use credential references
2. **Implement RBAC**: Use AdminRbac for all authorization decisions
3. **Use Gatekeeper**: Control access to all sensitive resources
4. **Rotate keys regularly**: Use Keymaster to manage key lifecycle
5. **Apply network policies**: Restrict pod-to-pod communication
6. **Validate all inputs**: Use ValidatingAdminRegistry for data validation
7. **Audit all operations**: Use Journal module to log security events

## Security Updates

Keep all dependencies up to date and monitor security advisories.

## Reporting Security Issues

Please report security issues to security@tetracube.io
