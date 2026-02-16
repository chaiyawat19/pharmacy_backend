import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { NewsArticle } from './entities/news.entity';
import { NewsCategory } from './entities/news_categories.entity';
import { NewsTag } from './entities/news_article_tags.entity';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';

import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(NewsArticle)
    private readonly newsRepository: Repository<NewsArticle>,
    @InjectRepository(NewsCategory)
    private readonly categoryRepository: Repository<NewsCategory>,
    @InjectRepository(NewsTag)
    private readonly tagRepository: Repository<NewsTag>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) { }

  // --- สร้างข่าวใหม่ ---
  async create(createNewsDto: CreateNewsDto) {
    const { categoryIds, tagIds, ...articleData } = createNewsDto;
    const news = this.newsRepository.create(articleData);
    if (categoryIds && categoryIds.length > 0) {
      news.categories = await this.categoryRepository.findBy({
        category_id: In(categoryIds),
      });
    }
    if (tagIds && tagIds.length > 0) {
      news.tags = await this.tagRepository.findBy({
        tag_id: In(tagIds),
      });
    }

    const savedNews = await this.newsRepository.save(news);

    // แจ้งเตือนผู้ใช้ทุกคนเมื่อมีข่าวใหม่
    try {
      const users = await this.usersService.findAll();
      await Promise.all(users.map(user =>
        this.notificationsService.create({
          user_id: user.user_id,
          title: 'มีประกาศข่าวใหม่ 📢',
          message: savedNews.title,
          notification_type_id: 1, // Let's use 1 for news/info
          link_url: `/user/news/${savedNews.article_id}`
        })
      ));
    } catch (error) {
      console.error('Error sending news notifications:', error);
    }

    return savedNews;
  }

  async update(id: number, updateNewsDto: UpdateNewsDto) {
    const { categoryIds, tagIds, ...articleData } = updateNewsDto;

    const news = await this.newsRepository.findOne({
      where: { article_id: id },
      relations: ['categories', 'tags'],
    });

    if (!news) throw new NotFoundException(`ไม่พบข่าว ID ${id}`);
    Object.assign(news, articleData);
    if (categoryIds) {
      news.categories = await this.categoryRepository.findBy({
        category_id: In(categoryIds),
      });
    }
    if (tagIds) {
      news.tags = await this.tagRepository.findBy({
        tag_id: In(tagIds),
      });
    }

    return await this.newsRepository.save(news);
  }

  async findAll() {
    return await this.newsRepository.find({
      relations: ['categories', 'tags'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number) {
    const news = await this.newsRepository.findOne({
      where: { article_id: id },
      relations: ['categories', 'tags'], // ดึงหมวดหมู่และแท็กมาด้วย
    });

    if (!news) {
      throw new NotFoundException(`ไม่พบข่าว ID ${id}`);
    }

    return news;
  }

  async remove(id: number) {
    const news = await this.findOne(id); // ตรวจสอบก่อนว่ามีข่าวนี้จริงไหม
    await this.newsRepository.remove(news);
    return { message: `ลบข่าว ID ${id} เรียบร้อยแล้ว` };
  }
}
