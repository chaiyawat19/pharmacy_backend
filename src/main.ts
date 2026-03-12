import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    // เพิ่มพอร์ต 3000 ของเครื่องเราเข้าไป 
    origin: [
      'https://phamacyexam-frontend-fork-production.up.railway.app',
      'http://localhost:3000',
    ],
    credentials: true,
  });

  // Enable WebSocket with Socket.io
  app.useWebSocketAdapter(new IoAdapter(app));

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe());

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/', // เวลาเรียกดูรูปจะเป็น http://localhost:3000/uploads/ชื่อไฟล์.jpg
  });

  await app.listen(process.env.PORT ?? 5000, '0.0.0.0');
}
bootstrap();
