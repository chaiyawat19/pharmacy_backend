import { Entity, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Note } from './note.entity';
import { Tag } from './tags.entity';

@Entity('note_tags')
export class NoteTag {
  @PrimaryColumn()
  note_id: number;

  @PrimaryColumn()
  tag_id: number;

  @ManyToOne(() => Note, (note) => note.tags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note: Note;

  @ManyToOne(() => Tag, (tag) => tag.noteTags)
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;
}
