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

    // ถ้าส่งมาเป็นสตริง (ซึ่งเราส่ง JSON.stringify มาจากหน้าบ้าน)
    if (typeof tags === 'string') {
      try {
        const parsed = JSON.parse(tags);
        if (Array.isArray(parsed)) {
          return parsed.map(t => {
            if (typeof t === 'string') return t;
            return t.tag_name || t.name || t.tag?.tag_name;
          }).filter(Boolean);
        }
        return [String(parsed)];
      } catch (e) {
        // กรณีไม่ใช่ JSON (เช่น "tag1, tag2")
        return tags.split(',').map(t => t.trim()).filter(t => t !== '' && t !== 'undefined');
      }
    }

    if (Array.isArray(tags)) {
      return tags.map(t => typeof t === 'string' ? t : (t.tag_name || t.name)).filter(Boolean);
    }

    return [];
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async create(@Req() req, @Body() dto: CreateNoteDto, @UploadedFiles() files: Express.Multer.File[]) {
    const tagIds = this.parseTags(dto.tagIds);
    const userId = req.user.id || req.user.user_id;
    return this.notesService.create({ ...dto, tagIds }, userId, files);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
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
    const tagIds = this.parseTags(dto.tagIds);
    const userId = req.user.id || req.user.user_id;

    // ส่งครบ 4 parameter ตามลำดับ: id, dto, userId, files
    return this.notesService.update(+id, { ...dto, tagIds: tagIds as any }, userId, files);
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