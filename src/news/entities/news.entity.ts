import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { NewsCategory } from './news_categories.entity';
import { NewsTag } from './news_article_tags.entity';

@Entity('news_articles')
export class NewsArticle {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  article_id: number;

  @Column({ type: 'int8' })
  author_id: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  excerpt: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cover_image_url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  source_url: string;

  @Column({ type: 'varchar', length: 50, default: 'DRAFT' })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @Column({ type: 'jsonb', nullable: true })
  content: any;

  @ManyToMany(() => NewsCategory, (category) => category.articles)
  @JoinTable({
    name: 'news_article_categories',
    joinColumn: { name: 'article_id', referencedColumnName: 'article_id' },
    inverseJoinColumn: {
      name: 'category_id',
      referencedColumnName: 'category_id',
    },
  })
  categories: NewsCategory[];

  @ManyToMany(() => NewsTag)
  @JoinTable({
    name: 'news_article_tags',
    joinColumn: { name: 'article_id', referencedColumnName: 'article_id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'tag_id' },
  })
  tags: NewsTag[];
}
