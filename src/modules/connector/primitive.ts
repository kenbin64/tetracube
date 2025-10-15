/**
 * Connector Primitive module
 */

export class ConnectorPrimitive {
  static connect(url: string): boolean {
    console.log(`Connecting to ${url}`);
    return true;
  }

  static disconnect(): void {
    console.log('Disconnecting');
  }

  static isConnected(): boolean {
    return true;
  }
}

export default ConnectorPrimitive;
