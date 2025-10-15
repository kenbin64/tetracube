/**
 * Gatekeeper module for access control
 */

export interface AccessRequest {
  userId: string;
  resource: string;
  action: string;
}

export class Gatekeeper {
  private allowedAccess: Map<string, Set<string>> = new Map();

  grant(userId: string, resource: string): void {
    if (!this.allowedAccess.has(userId)) {
      this.allowedAccess.set(userId, new Set());
    }
    this.allowedAccess.get(userId)!.add(resource);
  }

  revoke(userId: string, resource: string): void {
    const userAccess = this.allowedAccess.get(userId);
    if (userAccess) {
      userAccess.delete(resource);
    }
  }

  checkAccess(request: AccessRequest): boolean {
    const userAccess = this.allowedAccess.get(request.userId);
    return userAccess ? userAccess.has(request.resource) : false;
  }
}

export default Gatekeeper;
