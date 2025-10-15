/**
 * Admin HTTP Adapter module
 */

export interface HttpRequest {
  method: string;
  path: string;
  body?: any;
}

export interface HttpResponse {
  status: number;
  body: any;
}

export class AdminHttpAdapter {
  handle(request: HttpRequest): HttpResponse {
    console.log(`Handling ${request.method} ${request.path}`);
    
    return {
      status: 200,
      body: { message: 'Success' },
    };
  }
}

export default AdminHttpAdapter;
