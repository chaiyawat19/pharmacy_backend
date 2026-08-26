import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { NoteTag } from './note-tag.entity';
import { NoteFile } from './note-file.entity';

@Entity('notes')
export class Note {
  @PrimaryGeneratedColumn()
  note_id: number;

  @Column()
  title: string;

  @Column()
  content: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  link_url?: string;

  @Column()
  user_id: number;

  @ManyToOne(() => User, (user) => user.notes, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @OneToMany(() => NoteTag, (noteTag) => noteTag.note, {
    cascade: true,
  })
  tags: NoteTag[];

  @OneToMany(() => NoteFile, (file) => file.note)
  files: NoteFile[];
}
