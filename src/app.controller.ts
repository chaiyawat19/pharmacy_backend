// app.controller.ts
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Response } from 'express';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly appService: AppService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  async checkHealth(@Res({ passthrough: true }) res?: Response) {
    let dbConnected = false;
    let dbLatencyMs = 0;
    const start = Date.now();

    try {
      if (this.dataSource && this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        dbConnected = true;
        dbLatencyMs = Date.now() - start;
      }
    } catch (err) {
      dbConnected = false;
      if (res) {
        res.status(HttpStatus.SERVICE_UNAVAILABLE);
      }
    }

    const memory = process.memoryUsage();
    const isHealthy = dbConnected;

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        connected: dbConnected,
        latencyMs: dbLatencyMs,
      },
      memory: {
        heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
        rssMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      },
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
