import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { NewsArticle } from './news.entity'; // ตรวจสอบ path ไฟล์ NewsArticle ให้ถูกต้อง

@Entity('news_categories')
export class NewsCategory {
  @PrimaryGeneratedColumn({ type: 'int4' })
  category_id: number;

  @Column({ type: 'varchar', length: 100 })
  category_name: string;

  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @ManyToMany(() => NewsArticle, (article) => article.categories)
  articles: NewsArticle[];
}
