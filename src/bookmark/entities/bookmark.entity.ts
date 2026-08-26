import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { NewsArticle } from '../../news/entities/news.entity'; 

@Entity('user_bookmarks')
export class Bookmark {
  @PrimaryGeneratedColumn({ name: 'bookmark_id' })
  id: number;

  @Column({ name: 'user_id' }) // ระบุชื่อคอลัมน์ให้ตรงเป๊ะ
  userId: number;

  @Column({ name: 'article_id' }) // ระบุชื่อคอลัมน์ให้ตรงเป๊ะ
  articleId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => NewsArticle)
  @JoinColumn({ name: 'article_id' })
  news: NewsArticle;

  @CreateDateColumn()
  created_at: Date;
}
