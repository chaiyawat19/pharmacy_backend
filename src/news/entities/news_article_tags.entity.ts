import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('news_tags')
export class NewsTag {
  @PrimaryGeneratedColumn({ type: 'int4' })
  tag_id: number;

  @Column({ type: 'varchar', length: 100 })
  tag_name: string;

  @Column({ type: 'varchar', length: 100 })
  slug: string;
}
