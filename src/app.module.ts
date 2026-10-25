import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { UniversitiesModule } from './universities/universities.module';
import { RolesModule } from './roles/roles.module';
import { AuthModule } from './auth/auth.module';

import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RolesGuard } from './common/guards/roles.guard';
import {
  THROTTLE_TTL,
  GLOBAL_THROTTLE_LIMIT,
} from './common/throttle.constants';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { NotesModule } from './notes/notes.module';
import { ChatModule } from './chat/chat.module';
import { ItemsBankModule } from './items-bank/items-bank.module';
import { TopicsModule } from './topics/topics.module';
import { CategoriesModule } from './categories/categories.module';
import { CATModule } from './cat/cat.module';
import { MailModule } from './mail/mail.module';
import { UserDashboardModule } from './user-dashboard/user-dashboard.module'; // เพิ่ม import

import { SchedulesModule } from './schedules/schedules.module';
import { NewsModule } from './news/news.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BookmarkModule } from './bookmark/bookmark.module';
import { IrtModule } from './irt/irt.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { StudentProgressModule } from './student-progress/student-progress.module';
import { PaymentModule } from './payment/payment.module';
import { PersonalCalendarModule } from './personal-calendar/personal-calendar.module';
import { ItemReportsModule } from './item-reports/item-reports.module';
import { DailyReviewModule } from './daily-review/daily-review.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // cron — ใช้ส่งอีเมลเตือนก่อน subscription หมดอายุ
    // ── S2.2: Rate Limiting ────────────────────────────────────────────────
    // สำคัญ: throttler ทุกตัวในอาร์เรย์นี้มีผลกับ *ทุก* endpoint ไม่ใช่เฉพาะ route
    // ที่ใส่ @Throttle ค่าที่เข้มที่สุดจึงกลายเป็นเพดานของทั้งระบบ
    // ('payment' ที่เคยตั้ง limit 10 ตรงนี้ ทำให้ทั้ง API ถูกจำกัดเหลือ 10 req/นาที)
    //
    // ตัวที่ตั้งใจให้เข้มเฉพาะบาง route จึงต้องตั้ง default ตรงนี้ให้หลวมเท่า global
    // แล้วไประบุ limit จริงในตัว @Throttle ของ route นั้น ๆ แทน
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: THROTTLE_TTL,
        limit: GLOBAL_THROTTLE_LIMIT, // เพดานรวมต่อ IP
      },
      {
        name: 'auth',
        ttl: THROTTLE_TTL,
        limit: GLOBAL_THROTTLE_LIMIT, // default หลวม — limit จริงอยู่ใน @Throttle ของ AuthController
      },
      {
        name: 'payment',
        ttl: THROTTLE_TTL,
        limit: GLOBAL_THROTTLE_LIMIT, // default หลวม — limit จริงอยู่ใน @Throttle ของ PaymentController
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get<string>('DATABASE_URL');
        if (dbUrl) {
          return {
            type: 'postgres',
            url: dbUrl,
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            synchronize: true,
            autoLoadEntities: true,
          };
        }
        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 5432),
          username: configService.get<string>('DB_USERNAME', 'postgres'),
          password: configService.get<string>('DB_PASSWORD', ''),
          database: configService.get<string>('DB_DATABASE', 'postgres'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: true,
          autoLoadEntities: true,
        };
      },
      inject: [ConfigService],
    }),
    UsersModule,
    UniversitiesModule,
    RolesModule,
    AuthModule,
    NotesModule,
    ChatModule,
    ItemsBankModule,
    TopicsModule,
    CategoriesModule,
    CATModule,
    MailModule,
    SchedulesModule,
    NewsModule,
    NotificationsModule,
    BookmarkModule,
    IrtModule,
    DashboardModule,
    ChatbotModule,
    StudentProgressModule,
    UserDashboardModule,
    PaymentModule,
    PersonalCalendarModule,
    ItemReportsModule,
    DailyReviewModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Rate limiting (ลำดับแรก)
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
