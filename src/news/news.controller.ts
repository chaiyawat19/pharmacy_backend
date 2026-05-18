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
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

/** Mime types ที่อนุญาตให้อัปโหลดรูปภาพข่าว */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** ขนาดสูงสุด 5MB */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) { }

  /** ดึงข้อมูลข่าวจาก URL อัตโนมัติ */
  @Post('auto-fetch')
  async autoFetch(@Body('url') url: string) {
    return await this.newsService.autoFetchFacebook(url);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads', 
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              `ไม่รองรับประเภทไฟล์ ${file.mimetype} กรุณาอัปโหลดเฉพาะ JPG, PNG, WebP, GIF`,
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: MAX_IMAGE_SIZE,
        files: 1,
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    }
    return { url: `${process.env.NEXT_PUBLIC_API_URL}/uploads/${file.filename}` };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createNewsDto: CreateNewsDto, @Req() req) {
    const userId = req.user.userId;
    return this.newsService.create({
      ...createNewsDto,
      author_id: userId,
    });
  }

  @Get()
  findAll() {
    return this.newsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.newsService.findOne(+id);
  }

  @Roles(2)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateNewsDto: UpdateNewsDto) {
    return this.newsService.update(+id, updateNewsDto);
  }

  @Roles(2)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.newsService.remove(+id);
  }
}
