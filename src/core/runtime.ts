/**
 * Runtime core module
 */

export class Runtime {
  private isRunning: boolean = false;

  start(): void {
    this.isRunning = true;
    console.log('Runtime started');
  }

  stop(): void {
    this.isRunning = false;
    console.log('Runtime stopped');
  }

  getStatus(): boolean {
    return this.isRunning;
  }
}

export default Runtime;
