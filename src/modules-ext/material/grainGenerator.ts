/**
 * Grain Generator module
 */

export interface Grain {
  id: string;
  size: number;
  type: string;
}

export class GrainGenerator {
  private grainCounter = 0;

  generate(size: number, type: string): Grain {
    this.grainCounter++;
    return {
      id: `grain-${this.grainCounter}`,
      size,
      type,
    };
  }

  generateBatch(count: number, size: number, type: string): Grain[] {
    const grains: Grain[] = [];
    for (let i = 0; i < count; i++) {
      grains.push(this.generate(size, type));
    }
    return grains;
  }
}

export default GrainGenerator;
