import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Note } from './entities/note.entity';
import { NoteTag } from './entities/note-tag.entity';
import { Tag } from './entities/tags.entity';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,

    @InjectRepository(NoteTag)
    private readonly noteTagRepository: Repository<NoteTag>,

    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
  ) {}

  /* ================= CREATE ================= */
  async create(createNoteDto: CreateNoteDto, userId: number) {
    const { title, content, tagIds = [] } = createNoteDto;

    // 1️⃣ สร้าง note
    const note = await this.noteRepository.save(
      this.noteRepository.create({
        title,
        content,
        user_id: userId,
      }),
    );

    // 2️⃣ เพิ่ม tags (ถ้ามี)
    await this.attachTags(note.note_id, tagIds);

    return this.findOne(note.note_id);
  }

  /* ================= FIND ================= */
  findAll() {
    return this.noteRepository.find({
      relations: ['tags', 'tags.tag', 'files'],
    });
  }

  async findOne(id: number) {
    const note = await this.noteRepository.findOne({
      where: { note_id: id },
      relations: ['tags', 'tags.tag', 'files'],
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    return note;
  }

  /* ================= UPDATE ================= */
  async update(id: number, updateNoteDto: UpdateNoteDto) {
    const { title, content, tagIds } = updateNoteDto;

    // 1️⃣ update note หลัก
    await this.noteRepository.update(id, {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
    });

    // 2️⃣ ถ้ามี tagIds → reset tags
    if (Array.isArray(tagIds)) {
      await this.noteTagRepository.delete({ note_id: id });
      await this.attachTags(id, tagIds);
    }

    return this.findOne(id);
  }

  /* ================= DELETE ================= */
  async remove(id: number) {
    const note = await this.noteRepository.findOne({
      where: { note_id: id },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    return this.noteRepository.delete(id);
  }

  /* ================= HELPER ================= */
  private async attachTags(noteId: number, tagIds: number[]) {
    // 🔥 กรองค่าไม่ถูกต้อง
    const validIds = tagIds.filter(
      (id) => typeof id === 'number' && !isNaN(id),
    );

    if (validIds.length === 0) return;

    // 🔥 เช็คว่า tag มีจริงใน DB
    const tags = await this.tagRepository.find({
      where: { tag_id: In(validIds) },
      select: ['tag_id'],
    });

    if (tags.length === 0) return;

    const noteTags = tags.map((tag) =>
      this.noteTagRepository.create({
        note_id: noteId,
        tag_id: tag.tag_id,
      }),
    );

    await this.noteTagRepository.save(noteTags);
  }
}
