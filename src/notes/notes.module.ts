import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './entities/note.entity';
import { NoteFile } from './entities/note-file.entity';
import { NoteTag } from './entities/note-tag.entity';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Note, NoteFile, NoteTag])],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
