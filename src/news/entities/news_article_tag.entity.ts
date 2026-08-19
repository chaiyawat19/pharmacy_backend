import { Entity, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { NewsArticle } from './news.entity';
import { NewsTag } from './news_article_tags.entity';

// จุดเชื่อม (junction table) ระหว่าง news_articles ↔ news_tags
// หมายเหตุ: ไฟล์นี้ (news_article_tag.entity.ts) แมปกับตาราง news_article_tags
// ส่วนไฟล์ news_article_tags.entity.ts (พหูพจน์เดิม) แมปกับตาราง news_tags
@Entity('news_article_tags')
export class NewsArticleTag {
  @PrimaryColumn({ type: 'bigint' })
  article_id: number;

  @PrimaryColumn({ type: 'int4' })
  tag_id: number;

  @ManyToOne(() => NewsArticle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  article: NewsArticle;

  @ManyToOne(() => NewsTag)
  @JoinColumn({ name: 'tag_id' })
  tag: NewsTag;
}
