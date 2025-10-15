/**
 * Keymaster module for key management
 */

export interface Key {
  id: string;
  value: string;
  createdAt: Date;
}

export class Keymaster {
  private keys: Map<string, Key> = new Map();

  generateKey(id: string): Key {
    const key: Key = {
      id,
      value: this.generateRandomKey(),
      createdAt: new Date(),
    };
    this.keys.set(id, key);
    return key;
  }

  getKey(id: string): Key | undefined {
    return this.keys.get(id);
  }

  revokeKey(id: string): boolean {
    return this.keys.delete(id);
  }

  private generateRandomKey(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

export default Keymaster;
