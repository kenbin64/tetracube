/**
 * Indexer module for data indexing
 */

export class Indexer {
  private indices: Map<string, Set<string>> = new Map();

  addIndex(key: string, value: string): void {
    if (!this.indices.has(key)) {
      this.indices.set(key, new Set());
    }
    this.indices.get(key)!.add(value);
  }

  getIndex(key: string): Set<string> | undefined {
    return this.indices.get(key);
  }

  removeIndex(key: string): void {
    this.indices.delete(key);
  }
}

export default Indexer;
