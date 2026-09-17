import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import helmet from 'helmet';
import dns from 'dns';
import fs from 'fs';
import { DataSource } from 'typeorm';

// บังคับให้ Node แก้ DNS เป็น IPv4 ก่อน (Pinecone/Gemini ใช้ IPv4 เป็นหลัก)
// ต้อง set ไว้ที่นี่ (ในโค้ด) เพราะ NODE_OPTIONS ใน .env จะถูกโหลดช้าเกินไป —
// Node อ่าน NODE_OPTIONS ตอน start กระบวนการแล้ว dotenv ยังไม่ทำงาน
// (เดิมแก้แค่ start:dev ด้วย cross-env แต่พอ deploy แล้วไม่เข้า)
dns.setDefaultResultOrder('ipv4first');

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

  // ── Auto-sync PostgreSQL primary key sequences ────────────────────────────
  try {
    const dataSource = app.get(DataSource);
    if (dataSource && dataSource.isInitialized) {
      await dataSource.query(`
        DO $$
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (
                SELECT 
                    c.relname AS table_name,
                    a.attname AS column_name,
                    s.relname AS sequence_name
                FROM pg_class s
                JOIN pg_depend d ON d.objid = s.oid
                JOIN pg_class c ON c.oid = d.refobjid
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.refobjsubid
                WHERE s.relkind = 'S'
            ) LOOP
                EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)', 
                    r.sequence_name, r.column_name, r.table_name);
            END LOOP;
        END $$;
      `);
      console.log('✅ PostgreSQL database sequences synchronized successfully.');
    }
  } catch (err: any) {
    console.warn('⚠️ Could not sync PostgreSQL sequences:', err?.message);
  }

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
  //
  // FRONTEND_URL ใส่ได้หลายโดเมนโดยคั่นด้วยคอมมา เช่น
  //   FRONTEND_URL=https://pharmacyexamth.com,https://www.pharmacyexamth.com
  // เผื่อกรณีมีทั้งโดเมนจริง โดเมน www และ URL ของ Railway ใช้งานพร้อมกัน
  const envOrigins = [process.env.FRONTEND_URL, process.env.FRONTEND_URLS]
    .filter(Boolean)
    .flatMap((value) => (value as string).split(','))
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const allowedOrigins = [
    ...envOrigins,
    'https://pharmacyexamth.com',
    'https://www.pharmacyexamth.com',
    'https://phamacyexam-frontend-fork-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:8080',
  ].filter((origin, idx, list) => list.indexOf(origin) === idx);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  console.log('✅ CORS allowed origins:', allowedOrigins.join(', '));

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

  const baseUploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  if (!fs.existsSync(baseUploadDir)) {
    fs.mkdirSync(baseUploadDir, { recursive: true });
  }

  app.useStaticAssets(baseUploadDir, {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT ?? 5000, '0.0.0.0');
}
bootstrap();