/**
 * Validating Admin Registry module
 */

import { Admin, AdminRegistry } from './adminRegistry';

export class ValidatingAdminRegistry extends AdminRegistry {
  register(admin: Admin): void {
    if (!this.validate(admin)) {
      throw new Error('Invalid admin data');
    }
    super.register(admin);
  }

  private validate(admin: Admin): boolean {
    return !!(admin.id && admin.name && admin.email);
  }
}

export default ValidatingAdminRegistry;
