import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BookmarkService } from './bookmark.service';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { JwtAuthGuard } from '../common/guard/jwt-auth.guard';

@Controller('bookmark')
export class BookmarkController {
  constructor(private readonly bookmarkService: BookmarkService) { }

  @UseGuards(JwtAuthGuard)
  @Post('toggle')
  async toggle(@Body() createBookmarkDto: CreateBookmarkDto, @Request() req) {
    console.log('User ID from Request:', req.user.userId);
    return this.bookmarkService.toggleBookmark(
      req.user.userId,
      createBookmarkDto.articleId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Request() req) {
    // เรียก findAllByUser แทน findAll
    return this.bookmarkService.findAllByUser(req.user.id);
  }
}