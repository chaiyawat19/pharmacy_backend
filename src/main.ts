import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors({
    // ⚠️ ต้องใส่ URL ของ Frontend ให้ตรงเป๊ะๆ (ใน Error log คุณรันอยู่ที่ port 3001)
    origin: ['http://localhost:3000', 'http://localhost:3001'], 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // ✅ บรรทัดนี้สำคัญมาก เพื่อแก้ Error ในรูป
  });
  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
