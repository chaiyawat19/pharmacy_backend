// src/bookmark/bookmark.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookmarkService } from './bookmark.service';
import { BookmarkController } from './bookmark.controller';
import { Bookmark } from './entities/bookmark.entity';
import { NewsArticle } from '../news/entities/news.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Bookmark, NewsArticle])],
  controllers: [BookmarkController],
  providers: [BookmarkService],
  exports: [BookmarkService],
})
export class BookmarkModule {}
