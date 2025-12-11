import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Note } from './note.entity';

@Entity('note_tags')
export class NoteTag {
  @PrimaryGeneratedColumn()
  tag_id: number;

  @Column()
  note_id: number;

  @ManyToOne(() => Note, (note) => note.tags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note: Note;
}
