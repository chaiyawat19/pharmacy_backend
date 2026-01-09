import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';

import { Note } from './entities/note.entity';
import { NoteTag } from './entities/note-tag.entity';
import { Tag } from './entities/tags.entity';
import { NoteFile } from './entities/note-file.entity';


@Module({
  imports: [TypeOrmModule.forFeature([Note, NoteTag, Tag, NoteFile])],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
