import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { NewsArticle } from './entities/news.entity';
import { NewsCategory } from './entities/news_categories.entity';
import { NewsTag } from './entities/news_article_tags.entity';

import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NewsArticle, NewsCategory, NewsTag]),
    NotificationsModule,
    UsersModule,
  ],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService], // ใส่ไว้เผื่อโมดูลอื่นต้องการเรียกใช้
})
export class NewsModule { }
