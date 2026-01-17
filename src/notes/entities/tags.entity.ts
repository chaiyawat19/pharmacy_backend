import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NoteTag } from './note-tag.entity';

@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn()
  tag_id: number;

  @Column()
  user_id: number;

  @Column()
  tag_name: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => NoteTag, (nt) => nt.tag)
  noteTags: NoteTag[];
}
