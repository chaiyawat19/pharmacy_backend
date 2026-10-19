import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Request,
} from '@nestjs/common';
import { PersonalCalendarService } from './personal-calendar.service';
import {
  CreatePersonalEventDto,
  UpdatePersonalEventDto,
} from './dto/personal-event.dto';

/**
 * ปฏิทินส่วนตัวของผู้ใช้ — ทุก endpoint ต้องเข้าสู่ระบบ (JwtAuthGuard เป็น global guard)
 * และทำได้เฉพาะข้อมูลของตัวเอง (userId มาจาก token เท่านั้น)
 */
@Controller('personal-calendar')
export class PersonalCalendarController {
  constructor(private readonly service: PersonalCalendarService) {}

  @Get()
  getMine(@Request() req) {
    return this.service.getMyCalendar(req.user.userId);
  }

  @Post('events')
  create(@Request() req, @Body() dto: CreatePersonalEventDto) {
    return this.service.createEvent(req.user.userId, dto);
  }

  @Patch('events/:id')
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePersonalEventDto,
  ) {
    return this.service.updateEvent(req.user.userId, id, dto);
  }

  @Delete('events/:id')
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteEvent(req.user.userId, id);
  }

  /** มาร์คกำหนดการของแอดมินว่าสนใจ */
  @Put('marks/:scheduleId')
  mark(@Request() req, @Param('scheduleId', ParseIntPipe) scheduleId: number) {
    return this.service.mark(req.user.userId, scheduleId);
  }

  @Delete('marks/:scheduleId')
  unmark(
    @Request() req,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
  ) {
    return this.service.unmark(req.user.userId, scheduleId);
  }
}
