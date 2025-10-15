/**
 * Journal module for logging operations
 */

export interface JournalEntry {
  timestamp: Date;
  operation: string;
  data: any;
}

export class Journal {
  private entries: JournalEntry[] = [];

  log(operation: string, data: any): void {
    this.entries.push({
      timestamp: new Date(),
      operation,
      data,
    });
  }

  getEntries(): JournalEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

export default Journal;
