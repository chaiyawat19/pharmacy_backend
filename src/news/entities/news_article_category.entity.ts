import { Entity, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { NewsArticle } from './news.entity';
import { NewsCategory } from './news_categories.entity';

// จุดเชื่อม (junction table) ระหว่าง news_articles ↔ news_categories
@Entity('news_article_categories')
export class NewsArticleCategory {
  @PrimaryColumn({ type: 'bigint' })
  article_id: number;

  @PrimaryColumn({ type: 'int4' })
  category_id: number;

  @ManyToOne(() => NewsArticle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  article: NewsArticle;

  @ManyToOne(() => NewsCategory)
  @JoinColumn({ name: 'category_id' })
  category: NewsCategory;
}
