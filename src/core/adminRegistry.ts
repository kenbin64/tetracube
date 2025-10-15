/**
 * Admin Registry module for admin registration
 */

export interface Admin {
  id: string;
  name: string;
  email: string;
}

export class AdminRegistry {
  private admins: Map<string, Admin> = new Map();

  register(admin: Admin): void {
    this.admins.set(admin.id, admin);
  }

  get(id: string): Admin | undefined {
    return this.admins.get(id);
  }

  remove(id: string): boolean {
    return this.admins.delete(id);
  }

  list(): Admin[] {
    return Array.from(this.admins.values());
  }
}

export default AdminRegistry;
