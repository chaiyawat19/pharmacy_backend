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
// เปลี่ยนมาใช้ Syntax เดียวกับ SchedulesService
import { GoogleGenAI } from '@google/genai';
import puppeteer from 'puppeteer';

@Injectable()
export class NewsService {
  private ai: GoogleGenAI;

  constructor(
    @InjectRepository(NewsArticle)
    private readonly newsRepository: Repository<NewsArticle>,
    @InjectRepository(NewsCategory)
    private readonly categoryRepository: Repository<NewsCategory>,
    @InjectRepository(NewsTag)
    private readonly tagRepository: Repository<NewsTag>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {
    // ตั้งค่า Constructor แบบเดียวกับ SchedulesService
    this.ai = new GoogleGenAI({
      apiKey: 'AIzaSyCuvm1vI8Eun2vWXQb2BJmEJauQvI656Ds',
    });
  }

  async autoFetchFacebook(url: string) {
    let browser;
    try {
      // 1. เปิดเบราว์เซอร์จำลองด้วย Puppeteer
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );

      // 2. ไปยัง URL และ Scroll เพื่อโหลดโพสต์เพิ่ม
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 400;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= 2000) {
              clearInterval(timer);
              resolve(true);
            }
          }, 200);
        });
      });

      await new Promise((r) => setTimeout(r, 2000));
      const bodyText = await page.evaluate(() => document.body.innerText);
      await browser.close();

      // 3. เรียกใช้ AI สรุปข้อมูล (ใช้โครงสร้างแบบเดียวกับ SchedulesService)
      // 3. เรียกใช้ AI สรุปข้อมูล
      const response = await this.ai.models.generateContent({
        // แก้จาก 'gemini-1.5-flash' เป็นตัวด้านล่างนี้
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `คุณเป็นผู้เชี่ยวชาญการสรุปข่าวสารเภสัชกรรมจากสภาเภสัชกรรม 
                ช่วยแยกสรุปแต่ละโพสต์จากข้อความ Facebook ต่อไปนี้ และตอบกลับเป็น JSON Array:
                [{"title": "...", "content": "..."}]
                ข้อความ: ${bodyText.substring(0, 15000)}`,
              },
            ],
          },
        ],
      });

      // ดึง Text ออกมาแบบเดียวกับที่ใช้ใน Schedules
      const responseText = response.text || '';

      if (!responseText) {
        throw new Error('AI ไม่สามารถสรุปข้อมูลได้');
      }

      // คลีนค่า JSON และส่งออก
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      const newsArray = JSON.parse(cleanJson);

      return newsArray.map((news: any) => ({
        ...news,
        source_url: url,
      }));
    } catch (error: any) {
      if (browser) await browser.close();
      console.error('Multi-Fetch Error:', error.message);
      throw new Error('เกิดข้อผิดพลาดในการดึงข้อมูล: ' + error.message);
    }
  }

  // --- ฟังก์ชัน CRUD (คงเดิม) ---
  async create(createNewsDto: CreateNewsDto) {
    const { categoryIds, tagIds, ...articleData } = createNewsDto;
    const news = this.newsRepository.create(articleData);
    if (categoryIds && categoryIds.length > 0) {
      news.categories = await this.categoryRepository.findBy({ category_id: In(categoryIds) });
    }
    if (tagIds && tagIds.length > 0) {
      news.tags = await this.tagRepository.findBy({ tag_id: In(tagIds) });
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
    return await this.newsRepository.save(news);
  }

  async update(id: number, updateNewsDto: UpdateNewsDto) {
    const { categoryIds, tagIds, ...articleData } = updateNewsDto;
    const news = await this.newsRepository.findOne({
      where: { article_id: id },
      relations: ['categories', 'tags'],
    });
    if (!news) throw new NotFoundException(`ไม่พบข่าว ID ${id}`);
    Object.assign(news, articleData);
    if (categoryIds) news.categories = await this.categoryRepository.findBy({ category_id: In(categoryIds) });
    if (tagIds) news.tags = await this.tagRepository.findBy({ tag_id: In(tagIds) });
    return await this.newsRepository.save(news);
  }

  async findAll() {
    return await this.newsRepository.find({ relations: ['categories', 'tags'], order: { created_at: 'DESC' } });
  }

  async findOne(id: number) {
    const news = await this.newsRepository.findOne({ where: { article_id: id }, relations: ['categories', 'tags'] });
    if (!news) throw new NotFoundException(`ไม่พบข่าว ID ${id}`);
    return news;
  }

  async remove(id: number) {
    const news = await this.findOne(id);
    await this.newsRepository.remove(news);
    return { message: `ลบข่าว ID ${id} เรียบร้อยแล้ว` };
  }
}