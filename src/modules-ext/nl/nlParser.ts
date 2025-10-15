/**
 * NL Parser module for natural language parsing
 */

export interface ParsedQuery {
  intent: string;
  entities: string[];
  raw: string;
}

export class NlParser {
  parse(input: string): ParsedQuery {
    return {
      intent: 'unknown',
      entities: [],
      raw: input,
    };
  }

  tokenize(input: string): string[] {
    return input.split(' ');
  }
}

export default NlParser;
