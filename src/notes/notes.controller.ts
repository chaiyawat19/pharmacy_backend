import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { JwtAuthGuard } from 'src/common/guard/jwt-auth.guard';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) { }

  private parseTags(tags: any): string[] {
    if (!tags || tags === 'undefined' || tags === 'null') return [];
    if (typeof tags === 'string') {
      try {
        const parsed = JSON.parse(tags);
        if (Array.isArray(parsed)) {
          return parsed
            .map((t) => {
              if (typeof t === 'string') return t;
              return t.tag_name || t.name || t.tag?.tag_name;
            })
            .filter(Boolean);
        }
        return [String(parsed)];
      } catch (e) {
        return tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t !== '' && t !== 'undefined');
      }
    }
    if (Array.isArray(tags)) {
      return tags
        .map((t) => (typeof t === 'string' ? t : t.tag_name || t.name))
        .filter(Boolean);
    }
    return [];
  }

  // ฟังก์ชันช่วยจัดการ Decoding ชื่อไฟล์ภาษาไทย
  private decodeFilename(filename: string): string {
    try {
      return Buffer.from(filename, 'latin1').toString('utf8');
    } catch {
      return filename;
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          // ถอดรหัสเพื่อให้ได้นามสกุลไฟล์ที่ถูกต้องในกรณีที่เป็นภาษาไทย
          const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(originalName)}`);
        },
      }),
    }),
  )
  async create(
    @Req() req,
    @Body() dto: CreateNoteDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    // 1. แก้ภาษาไทยเพี้ยนสำหรับชื่อไฟล์ต้นฉบับที่จะเซฟลง Database
    if (files) {
      files.forEach((f) => (f.originalname = this.decodeFilename(f.originalname)));
    }

    const tagIds = this.parseTags(dto.tagIds);
    const userId = req.user.userId;
    return this.notesService.create({ ...dto, tagIds }, userId, files);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(originalName)}`);
        },
      }),
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
    @Req() req,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    // 1. แก้ภาษาไทยเพี้ยนสำหรับไฟล์ใหม่ที่จะเซฟลง Database
    if (files) {
      files.forEach((f) => (f.originalname = this.decodeFilename(f.originalname)));
    }

    const tagIds = this.parseTags(dto.tagIds);

    let deletedFiles = (dto as any).deletedFiles;
    if (typeof deletedFiles === 'string') {
      try {
        deletedFiles = JSON.parse(deletedFiles);
      } catch {
        deletedFiles = deletedFiles ? [deletedFiles] : [];
      }
    }

    const userId = req.user.userId;
    return this.notesService.update(
      +id,
      { ...dto, tagIds: tagIds as any, deletedFiles } as any,
      userId,
      files,
    );
  }

  @Get()
  findAll() {
    return this.notesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.notesService.findOne(+id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.notesService.remove(+id);
  }
}