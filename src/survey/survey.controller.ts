import { Body, Controller, Get, Patch, Post, Request } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { SurveyService } from './survey.service';
import { SubmitSurveyDto } from './dto/submit-survey.dto';
import { UpdateSurveySettingsDto } from './dto/update-survey-settings.dto';

/** ทุก endpoint ต้องเข้าสู่ระบบ (JwtAuthGuard เป็น global guard ใน app.module.ts) */
@Controller('survey')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  /** ชุดคำถาม + สถานะเปิด/ปิด + ผู้ใช้คนนี้ตอบไปแล้วหรือยัง */
  @Get()
  getSurvey(@Request() req) {
    return this.surveyService.getForUser(req.user.userId);
  }

  /** ใช้ในเมนูรูปโปรไฟล์ของผู้ใช้ — ตัดชุดคำถามออกให้เบา */
  @Get('status')
  getStatus(@Request() req) {
    return this.surveyService.getStatus(req.user.userId);
  }

  @Post('responses')
  submit(@Request() req, @Body() dto: SubmitSurveyDto) {
    return this.surveyService.submit(req.user.userId, dto.answers);
  }

  /** [Super Admin] แดชบอร์ดผลการประเมิน */
  @Roles(3)
  @Get('admin/summary')
  summary() {
    return this.surveyService.getSummary();
  }

  /** [Super Admin] คำตอบรายคนแบบไม่ระบุตัวตน สำหรับส่งออกเป็นไฟล์ */
  @Roles(3)
  @Get('admin/responses')
  responses() {
    return this.surveyService.getResponsesForExport();
  }

  /** [Super Admin] เปิด/ปิดการรับคำตอบ */
  @Roles(3)
  @Patch('admin/settings')
  updateSettings(@Request() req, @Body() dto: UpdateSurveySettingsDto) {
    return this.surveyService.updateSettings(req.user.userId, dto.isOpen);
  }
}
