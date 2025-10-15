/**
 * Canonical module for canonical representation
 */

export class Canonical {
  normalize(data: any): any {
    return data;
  }

  validate(_data: any): boolean {
    return true;
  }
}

export default Canonical;
