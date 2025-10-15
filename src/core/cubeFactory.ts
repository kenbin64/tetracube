/**
 * Cube Factory module for creating cubes
 */

export interface Cube {
  id: string;
  type: string;
  data: any;
}

export class CubeFactory {
  private cubes: Map<string, Cube> = new Map();

  create(type: string, data: any): Cube {
    const cube: Cube = {
      id: this.generateId(),
      type,
      data,
    };
    this.cubes.set(cube.id, cube);
    return cube;
  }

  get(id: string): Cube | undefined {
    return this.cubes.get(id);
  }

  private generateId(): string {
    return `cube-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default CubeFactory;
