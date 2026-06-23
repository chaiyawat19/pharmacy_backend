import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import helmet from 'helmet';

// ✅ Custom IoAdapter พร้อม CORS
class CustomIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: [
          process.env.FRONTEND_URL || 'http://localhost:3000',
          'http://localhost:3000',
          'http://localhost:8080',
        ],
        credentials: true,
      },
    });
    return server;
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ── S2.3: Helmet — HTTP Security Headers ──────────────────────────────────
  // ปิด contentSecurityPolicy เพื่อไม่ให้ขัด API responses
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://phamacyexam-frontend-fork-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:8080',
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // ✅ ใช้ CustomIoAdapter แทน IoAdapter ธรรมดา
  app.useWebSocketAdapter(new CustomIoAdapter(app));

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.use(cookieParser());

  // ── S2.1: ValidationPipe — Whitelist + Transform ──────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,             // ตัด field ที่ไม่อยู่ใน DTO ออกอัตโนมัติ
      forbidNonWhitelisted: true,  // ส่ง 400 ถ้ามี field แปลกปลอม
      transform: true,             // auto-transform types เช่น string → number
    }),
  );

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT ?? 5000, '0.0.0.0');
}
bootstrap();