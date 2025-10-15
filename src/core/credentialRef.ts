/**
 * Credential Reference module
 */

export interface CredentialRef {
  id: string;
  type: string;
  reference: string;
}

export class CredentialRefManager {
  private credentials: Map<string, CredentialRef> = new Map();

  store(credential: CredentialRef): void {
    this.credentials.set(credential.id, credential);
  }

  retrieve(id: string): CredentialRef | undefined {
    return this.credentials.get(id);
  }

  revoke(id: string): boolean {
    return this.credentials.delete(id);
  }
}

export default CredentialRefManager;
