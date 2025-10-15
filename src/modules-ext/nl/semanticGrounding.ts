/**
 * Semantic Grounding module
 */

export interface SemanticConcept {
  name: string;
  relations: string[];
}

export class SemanticGrounding {
  private concepts: Map<string, SemanticConcept> = new Map();

  defineConcept(concept: SemanticConcept): void {
    this.concepts.set(concept.name, concept);
  }

  getConcept(name: string): SemanticConcept | undefined {
    return this.concepts.get(name);
  }

  ground(text: string): SemanticConcept | undefined {
    return this.concepts.get(text);
  }
}

export default SemanticGrounding;
