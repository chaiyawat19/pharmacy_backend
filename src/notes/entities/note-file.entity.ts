import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Note } from './note.entity';

@Entity('note_files')
export class NoteFile {
  @PrimaryGeneratedColumn()
  file_id: number;

  @Column()
  note_id: number;

  @Column()
  original_filename: string;

  @Column()
  storage_path: string;

  @Column({ nullable: true })
  file_type: string;

  @Column({ nullable: true })
  file_size_bytes: number;

  @CreateDateColumn()
  uploaded_at: Date;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  @ManyToOne(() => Note, (note) => note.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note: Note;
}
