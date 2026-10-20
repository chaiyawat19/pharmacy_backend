import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { DailyReviewService } from './daily-review.service';
import { AnswerDailyReviewDto } from './dto/daily-review.dto';

/** ทบทวนความรู้ประจำวัน — ต้องเข้าสู่ระบบ (JwtAuthGuard เป็น global guard) ข้อมูลของตัวเองเท่านั้น */
@Controller('daily-review')
export class DailyReviewController {
  constructor(private readonly service: DailyReviewService) {}

  @Get('today')
  today(@Request() req) {
    return this.service.getToday(req.user.userId);
  }

  @Post('answer')
  answer(@Request() req, @Body() dto: AnswerDailyReviewDto) {
    return this.service.answer(req.user.userId, dto);
  }
}
