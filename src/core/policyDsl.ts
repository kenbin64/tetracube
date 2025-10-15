/**
 * Policy DSL module for policy definition
 */

export interface Policy {
  name: string;
  rules: Rule[];
}

export interface Rule {
  condition: string;
  action: string;
}

export class PolicyDsl {
  private policies: Map<string, Policy> = new Map();

  definePolicy(policy: Policy): void {
    this.policies.set(policy.name, policy);
  }

  getPolicy(name: string): Policy | undefined {
    return this.policies.get(name);
  }

  evaluate(policyName: string, _context: any): boolean {
    const policy = this.policies.get(policyName);
    if (!policy) return false;
    return true;
  }
}

export default PolicyDsl;
