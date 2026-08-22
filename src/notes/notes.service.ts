import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from './entities/note.entity';
import { NoteTag } from './entities/note-tag.entity';
import { Tag } from './entities/tags.entity';
import { NoteFile } from './entities/note-file.entity';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
    @InjectRepository(NoteTag)
    private readonly noteTagRepository: Repository<NoteTag>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    @InjectRepository(NoteFile)
    private readonly noteFileRepository: Repository<NoteFile>,
  ) {}

  async create(createNoteDto: CreateNoteDto, userId: number, files: Express.Multer.File[]) {
    const { title, content, link_url, tagIds = [] } = createNoteDto;

    const note = await this.noteRepository.save(
      this.noteRepository.create({
        title,
        content,
        link_url,
        user_id: userId,
      }),
    );

    if (tagIds && tagIds.length > 0) {
      await this.attachTags(note.note_id, tagIds, userId);
    }

    if (files && files.length > 0) {
      const fileEntities = files.map((file) => {
        const nf = new NoteFile();
        nf.note_id = note.note_id;
        nf.storage_path = file.filename;
        // ใช้ชื่อที่ผ่านการ Decode มาจาก Controller แล้ว
        nf.original_filename = file.originalname; 
        nf.file_type = file.mimetype;
        nf.file_size_bytes = file.size;
        return nf;
      });
      await this.noteFileRepository.save(fileEntities);
    }

    return this.findOne(note.note_id);
  }

  findAll(userId?: number) {
    const where = userId ? { user_id: userId } : {};
    return this.noteRepository.find({
      where,
      relations: ['tags', 'tags.tag', 'files'],
      order: { note_id: 'DESC' },
    });
  }

  async findOne(id: number, userId?: number) {
    const where: any = { note_id: id };
    if (userId) where.user_id = userId;

    const note = await this.noteRepository.findOne({
      where,
      relations: ['tags', 'tags.tag', 'files'],
    });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  async update(
    id: number,
    updateNoteDto: UpdateNoteDto,
    userId: number,
    files?: Express.Multer.File[],
  ) {
    const { title, content, link_url, tagIds } = updateNoteDto;

    const deletedFilesRaw = (updateNoteDto as any).deletedFiles;
    let deletedFileIds: any[] = [];
    if (Array.isArray(deletedFilesRaw)) {
      deletedFileIds = deletedFilesRaw;
    } else if (typeof deletedFilesRaw === 'string' && deletedFilesRaw !== '') {
      try {
        const parsed = JSON.parse(deletedFilesRaw);
        deletedFileIds = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        deletedFileIds = [deletedFilesRaw];
      }
    }

    await this.noteRepository.update(id, {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(link_url !== undefined && { link_url }),
    });

    if (tagIds !== undefined) {
      await this.noteTagRepository.delete({ note_id: id });
      await this.attachTags(id, tagIds, userId);
    }

    if (deletedFileIds.length > 0) {
      for (const fId of deletedFileIds) {
        const file = await this.noteFileRepository.findOne({
          where: { file_id: Number(fId), note_id: id },
        });

        if (file) {
          try {
            const filePath = path.join(process.cwd(), 'uploads', file.storage_path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (err) {
            console.error(`File deletion error: ${file.storage_path}`, err);
          }
          await this.noteFileRepository.delete(file.file_id);
        }
      }
    }

    if (files && files.length > 0) {
      const fileEntities = files.map((file) => {
        const nf = new NoteFile();
        nf.note_id = id;
        nf.storage_path = file.filename;
        nf.original_filename = file.originalname; // ใช้ชื่อที่ Decode มาแล้ว
        nf.file_type = file.mimetype;
        nf.file_size_bytes = file.size;
        return nf;
      });
      await this.noteFileRepository.save(fileEntities);
    }
    return this.findOne(id);
  }

  async remove(id: number) {
    const note = await this.findOne(id);
    if (note.files && note.files.length > 0) {
      for (const file of note.files) {
        try {
          const filePath = path.join(process.cwd(), 'uploads', file.storage_path);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Delete file error: ${file.storage_path}`, err);
        }
      }
    }
    await this.noteFileRepository.delete({ note_id: id });
    await this.noteTagRepository.delete({ note_id: id });
    return this.noteRepository.delete(id);
  }

  private async attachTags(noteId: number, tags: any, userId: number) {
    let rawTagNames: string[] = [];
    if (Array.isArray(tags)) {
      rawTagNames = tags.map((t) => (typeof t === 'string' ? t : t.tag?.tag_name || t.tag_name || t.name));
    } else if (typeof tags === 'string') {
      try {
        const parsed = JSON.parse(tags);
        rawTagNames = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        rawTagNames = tags.split(',').map((t) => t.trim());
      }
    }

    const cleanTagNames = [...new Set(rawTagNames)]
      .map((n) => String(n).trim())
      .filter(
        (n) =>
          n &&
          n.toLowerCase() !== 'undefined' &&
          n.toLowerCase() !== 'null' &&
          n !== '',
      );

    for (const name of cleanTagNames) {
      let tag = await this.tagRepository.findOne({
        where: { tag_name: name, user_id: userId },
      });
      if (!tag) {
        tag = await this.tagRepository.save(
          this.tagRepository.create({ tag_name: name, user_id: userId }),
        );
      }
      await this.noteTagRepository.upsert(
        { note_id: noteId, tag_id: tag.tag_id },
        ['note_id', 'tag_id'],
      );
    }
  }
}