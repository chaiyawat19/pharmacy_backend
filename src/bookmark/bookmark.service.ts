import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bookmark } from './entities/bookmark.entity';
import { NewsArticle } from '../news/entities/news.entity';

@Injectable()
export class BookmarkService {
  constructor(
    @InjectRepository(Bookmark)
    private bookmarkRepository: Repository<Bookmark>,
    @InjectRepository(NewsArticle)
    private newsRepository: Repository<NewsArticle>,
  ) {}

  async toggleBookmark(userId: number, articleId: number) {
    if (!userId) {
      throw new Error('Unauthorized: User ID is required');
    }
    const existing = await this.bookmarkRepository.findOne({
      where: {
        userId: userId,
        articleId: articleId,
      },
    });

    if (existing) {
      await this.bookmarkRepository.remove(existing);
      return { isBookmarked: false };
    }

    const bookmark = new Bookmark(); 
    bookmark.userId = userId;
    bookmark.articleId = articleId;

    try {
      await this.bookmarkRepository.save(bookmark);
      return { isBookmarked: true };
    } catch (error) {
      console.error("Save Error:", error);
      throw error;
    }
  }
  async findAllByUser(userId: number) {
    return this.bookmarkRepository.find({
      where: { user: { id: userId } as any },
      relations: ['news'],
      order: { created_at: 'DESC' },
    });
  }
  async getMyBookmarkIds(userId: number) {
    const bookmarks = await this.bookmarkRepository.find({
      where: { user: { id: userId } as any },
      select: ['news'],
      relations: ['news'],
    });
    return bookmarks.map(b => b.news.article_id);
  }
}
