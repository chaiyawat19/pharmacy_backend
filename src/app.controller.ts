// app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(
    @InjectConnection()
    private connection: Connection,
    private readonly appService: AppService
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async checkHealth() {
    return {
      database: this.connection.isConnected,
      status: 'ok',
    };
  }
}
