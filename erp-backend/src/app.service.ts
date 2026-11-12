import { Injectable } from '@nestjs/common';

export interface ServerStatus {
  status: 'ok';
  message: string;
  environment: string;
  timestamp: string;
}

@Injectable()
export class AppService {
  getStatus(): ServerStatus {
    return {
      status: 'ok',
      message: 'SPS ERP backend server is active',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    };
  }
}
