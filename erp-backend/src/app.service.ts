import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface ServerStatus {
  status: 'ok';
  message: string;
  environment: string;
  timestamp: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  server: 'up';
  database: 'up' | 'down';
  uptimeSeconds: number;
  timestamp: string;
}

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  getStatus(): ServerStatus {
    return {
      status: 'ok',
      message: 'SPS ERP backend server is active',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    };
  }

  async getHealth(): Promise<HealthStatus> {
    const databaseUp = await this.isDatabaseUp();
    return {
      status: databaseUp ? 'ok' : 'error',
      server: 'up',
      database: databaseUp ? 'up' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async isDatabaseUp(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
