import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
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

  @Column()
  user_id: number;

  @ManyToOne(() => User, (user) => user.notes, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => NoteTag, (noteTag) => noteTag.note)
  tags: NoteTag[];

  @OneToMany(() => NoteFile, (file) => file.note)
  files: NoteFile[];
}
