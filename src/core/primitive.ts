/**
 * Primitive module for primitive operations
 */

export class Primitive {
  static isString(value: any): boolean {
    return typeof value === 'string';
  }

  static isNumber(value: any): boolean {
    return typeof value === 'number';
  }

  static isBoolean(value: any): boolean {
    return typeof value === 'boolean';
  }

  static isObject(value: any): boolean {
    return typeof value === 'object' && value !== null;
  }

  static isArray(value: any): boolean {
    return Array.isArray(value);
  }
}

export default Primitive;
