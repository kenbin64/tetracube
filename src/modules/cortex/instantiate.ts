/**
 * Instantiate module for object instantiation
 */

export class Instantiate {
  static create<T>(type: new (...args: any[]) => T, ...args: any[]): T {
    return new type(...args);
  }

  static createWithDefaults<T>(type: new () => T): T {
    return new type();
  }
}

export default Instantiate;
