import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { Note } from './entities/note.entity';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
  ) {}

  create(createNoteDto: CreateNoteDto, userId: number) {
    const newNote = this.noteRepository.create({
      ...createNoteDto,
      user: { user_id: userId }, // <<== บอกว่า note นี้เป็นของ user คนนี้
    });

    return this.noteRepository.save(newNote);
  }
  findAll() {
    return this.noteRepository.find({
      relations: ['tags', 'files'],
    });
  }

  findOne(id: number) {
    return this.noteRepository.findOne({
      where: { note_id: id },
      relations: ['tags', 'files'],
    });
  }

  update(id: number, updateNoteDto: UpdateNoteDto) {
    return this.noteRepository.update(id, updateNoteDto);
  }

  remove(id: number) {
    return this.noteRepository.delete(id);
  }
}
