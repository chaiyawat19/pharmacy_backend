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
import { RolesGuard } from './common/guard/roles.guard';
import { JwtAuthGuard } from './common/guard/jwt-auth.guard'; // import guard ใหม่
import { NotesModule } from './notes/notes.module';
import { ChatModule } from './chat/chat.module';
import { ItemsBankModule } from './items-bank/items-bank.module';
import { TopicsModule } from './topics/topics.module';
import { CategoriesModule } from './categories/categories.module';
import { CATModule } from './cat/cat.module';
import { MailModule } from './mail/mail.module';
import { SchedulesController } from './schedules/schedules.controller';
import { SchedulesModule } from './schedules/schedules.module';
import { NewsModule } from './news/news.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BookmarkModule } from './bookmark/bookmark.module';
import { IrtModule } from './irt/irt.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false, // ⚠️ ปิดไว้ก่อนเพราะติด Constraint ของ universities
        autoLoadEntities: true,
      }),
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

  ],
  controllers: [AppController],
  providers: [
    AppService,
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
export class AppModule { }
