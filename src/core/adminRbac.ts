/**
 * Admin RBAC module for role-based access control
 */

export interface Role {
  name: string;
  permissions: string[];
}

export class AdminRbac {
  private roles: Map<string, Role> = new Map();
  private userRoles: Map<string, string[]> = new Map();

  defineRole(role: Role): void {
    this.roles.set(role.name, role);
  }

  assignRole(userId: string, roleName: string): void {
    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, []);
    }
    this.userRoles.get(userId)!.push(roleName);
  }

  hasPermission(userId: string, permission: string): boolean {
    const userRoles = this.userRoles.get(userId);
    if (!userRoles) return false;

    for (const roleName of userRoles) {
      const role = this.roles.get(roleName);
      if (role && role.permissions.includes(permission)) {
        return true;
      }
    }
    return false;
  }
}

export default AdminRbac;
