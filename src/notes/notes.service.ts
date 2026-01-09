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
  ) { }

  /* ================= CREATE ================= */
  async create(createNoteDto: CreateNoteDto, userId: number, files: Express.Multer.File[]) {
    const { title, content, tagIds = [] } = createNoteDto;

    const note = await this.noteRepository.save(
      this.noteRepository.create({
        title,
        content,
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
        nf.original_filename = file.originalname;
        nf.file_type = file.mimetype;
        nf.file_size_bytes = file.size;
        return nf;
      });
      await this.noteFileRepository.save(fileEntities);
    }

    return this.findOne(note.note_id);
  }

  /* ================= FIND ================= */
  findAll() {
    return this.noteRepository.find({
      relations: ['tags', 'tags.tag', 'files'],
      order: { note_id: 'DESC' },
    });
  }

  async findOne(id: number) {
    const note = await this.noteRepository.findOne({
      where: { note_id: id },
      relations: ['tags', 'tags.tag', 'files'],
    });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  /* ================= UPDATE ================= */
  async update(
    id: number,
    updateNoteDto: UpdateNoteDto,
    userId: number,
    files?: Express.Multer.File[],
  ) {
    const { title, content, tagIds } = updateNoteDto;
    
    // ดึงรายการไฟล์ที่จะลบ (รองรับทั้งส่งมาเป็นตัวเดียว หรือเป็น Array)
    const deletedFilesRaw = (updateNoteDto as any).deletedFiles;
    const deletedFileIds = Array.isArray(deletedFilesRaw) 
      ? deletedFilesRaw 
      : deletedFilesRaw ? [deletedFilesRaw] : [];

    // 1. อัปเดต Title/Content
    await this.noteRepository.update(id, {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
    });

    // 2. จัดการ Tags (ลบของเก่าทิ้งแล้วผูกใหม่)
    if (tagIds !== undefined) {
      await this.noteTagRepository.delete({ note_id: id });
      await this.attachTags(id, tagIds, userId);
    }

    // 3. จัดการลบไฟล์เดิมที่ถูกเลือกทิ้ง
    if (deletedFileIds.length > 0) {
      for (const fileId of deletedFileIds) {
        const file = await this.noteFileRepository.findOne({ 
          where: { file_id: Number(fileId), note_id: id } 
        });
        
        if (file) {
          try {
            const filePath = path.join(process.cwd(), 'uploads', file.storage_path);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath); // ลบไฟล์จาก Folder
            }
          } catch (err) {
            console.error(`Failed to delete file on disk: ${file.storage_path}`, err);
          }
          await this.noteFileRepository.delete(file.file_id); // ลบจาก DB
        }
      }
    }

    // 4. เพิ่มไฟล์ใหม่
    if (files && files.length > 0) {
      const fileEntities = files.map((file) => {
        const nf = new NoteFile();
        nf.note_id = id;
        nf.storage_path = file.filename;
        nf.original_filename = file.originalname;
        nf.file_type = file.mimetype;
        nf.file_size_bytes = file.size;
        return nf;
      });
      await this.noteFileRepository.save(fileEntities);
    }

    return this.findOne(id);
  }

  /* ================= DELETE ================= */
  async remove(id: number) {
    const note = await this.findOne(id);
    
    // ลบไฟล์ทั้งหมดของ Note นี้ออกจากเครื่อง
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
    
    // ลบความสัมพันธ์ทั้งหมด (File -> Tag -> Note)
    await this.noteFileRepository.delete({ note_id: id });
    await this.noteTagRepository.delete({ note_id: id });
    return this.noteRepository.delete(id);
  }

  /* ================= ATTACH TAGS (Logic สำคัญ) ================= */
  private async attachTags(noteId: number, tags: any, userId: number) {
    let rawTagNames: string[] = [];

    // ดึงรายชื่อแท็กออกมาให้เป็น Array ของ String เสมอ
    if (Array.isArray(tags)) {
      rawTagNames = tags.map(t => {
        if (typeof t === 'string') return t;
        return t.tag?.tag_name || t.tag_name || t.name;
      });
    } else if (typeof tags === 'string') {
      try {
        const parsed = JSON.parse(tags);
        rawTagNames = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        rawTagNames = tags.split(',').map(t => t.trim());
      }
    }

    // --- กรองข้อมูลขยะ: ลบคำว่า "undefined", "null" และค่าว่างทิ้ง ---
    const cleanTagNames = [...new Set(rawTagNames)]
      .map(n => String(n).trim())
      .filter(n => n && n.toLowerCase() !== 'undefined' && n.toLowerCase() !== 'null' && n !== '');

    for (const name of cleanTagNames) {
      // 1. หาว่าแท็กนี้เคยมีในระบบของ User คนนี้หรือยัง
      let tag = await this.tagRepository.findOne({ where: { tag_name: name, user_id: userId } });
      
      // 2. ถ้ายังไม่มีให้สร้างใหม่
      if (!tag) {
        tag = await this.tagRepository.save(this.tagRepository.create({ tag_name: name, user_id: userId }));
      }

      // 3. เชื่อม Note เข้ากับ Tag (ใช้ upsert เพื่อป้องกันการ insert ซ้ำซ้อน)
      await this.noteTagRepository.upsert(
        { note_id: noteId, tag_id: tag.tag_id },
        ['note_id', 'tag_id']
      );
    }
  }
}