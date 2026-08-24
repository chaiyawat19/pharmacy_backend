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
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RolesGuard } from './common/guards/roles.guard';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // ── S2.2: Rate Limiting ────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000, // 1 นาที
        limit: 300, // 300 requests/นาที ต่อ IP (global)
      },
      {
        name: 'auth',
        ttl: 60000, // 1 นาที
        limit: 60, // 60 requests/นาที สำหรับ auth endpoints
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
