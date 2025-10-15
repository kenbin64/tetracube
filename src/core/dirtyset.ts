/**
 * DirtySet module for tracking dirty state
 */

export class DirtySet {
  private dirtyItems: Set<string> = new Set();

  markDirty(id: string): void {
    this.dirtyItems.add(id);
  }

  markClean(id: string): void {
    this.dirtyItems.delete(id);
  }

  isDirty(id: string): boolean {
    return this.dirtyItems.has(id);
  }

  getDirtyItems(): string[] {
    return Array.from(this.dirtyItems);
  }

  clear(): void {
    this.dirtyItems.clear();
  }
}

export default DirtySet;
