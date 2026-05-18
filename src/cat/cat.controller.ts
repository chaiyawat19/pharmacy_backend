import {
    Controller,
    Post,
    Body,
    Get,
    Delete,
    Param,
    UseGuards,
    Request,
} from '@nestjs/common';
import { CATExamService } from './cat-exam.service';
import { StartCATExamDto, SubmitCATAnswerDto } from './dto/cat-exam.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('cat')
@UseGuards(JwtAuthGuard)
export class CATController {
    constructor(private readonly catExamService: CATExamService) { }

    /**
     * ดึงค่าความสามารถล่าสุดของผู้ใช้
     */
    @Get('latest-ability')
    async getLatestAbility(@Request() req) {
        const userId = req.user.userId;
        return this.catExamService.getLatestAbility(userId);
    }

    /**
     * เริ่มการสอบ CAT
     */
    @Post('start')
    async startExam(@Request() req, @Body() startExamDto: StartCATExamDto) {
        const userId = req.user.userId;
        return this.catExamService.startCATExam(userId, startExamDto);
    }

    /**
     * รับข้อสอบข้อถัดไป
     */
    @Get('session/:session_id/next-item')
    async getNextItem(@Request() req, @Param('session_id') sessionId: string) {
        const userId = req.user.userId;
        return this.catExamService.getNextItem(userId, +sessionId);
    }

    /**
     * ส่งคำตอบ
     */
    @Post('submit-answer')
    async submitAnswer(
        @Request() req,
        @Body() submitAnswerDto: SubmitCATAnswerDto,
    ) {
        const userId = req.user.userId;
        return this.catExamService.submitAnswer(userId, submitAnswerDto);
    }

    /**
     * ดูผลการสอบ
     */
    @Get('session/:session_id/result')
    async getExamResult(@Request() req, @Param('session_id') sessionId: string) {
        const userId = req.user.userId;
        return this.catExamService.getExamResult(userId, +sessionId);
    }

    /**
     * ดูประวัติการสอบ CAT
     */
    @Get('history')
    async getExamHistory(@Request() req) {
        const userId = req.user.userId;
        return this.catExamService.getUserCATHistory(userId);
    }

    /**
     * ยกเลิก CAT session ออกกลางคัน (รีเฟรช / ไปหน้าอื่น) — ไม่บันทึกประวัติ
     */
    @Delete('session/:session_id/cancel')
    async cancelSession(@Request() req, @Param('session_id') sessionId: string) {
        const userId = req.user.userId;
        return this.catExamService.cancelCATSession(userId, +sessionId);
    }

    /**
     * ดูข้อมูล session ปัจจุบัน
     */
    @Get('session/:session_id')
    async getSession(@Request() req, @Param('session_id') sessionId: string) {
        const userId = req.user.userId;
        return this.catExamService.getCATSession(userId, +sessionId);
    }

    /**
     * ตรวจสอบว่า item bank พร้อมสำหรับ CAT หรือไม่
     */
    @Get('check-readiness/:item_bank_id')
    async checkCATReadiness(@Param('item_bank_id') itemBankId: string) {
        return this.catExamService.checkCATReadiness(+itemBankId);
    }

    // ==================== Admin endpoints ====================

    /**
     * [Admin] Session analytics overview
     */
    @Roles(2)
    @Get('admin/analytics')
    async getAdminAnalytics() {
        return this.catExamService.getAdminAnalytics();
    }

    /**
     * [Admin] Item exposure report across all sessions
     */
    @Roles(2)
    @Get('admin/exposure')
    async getExposureReport() {
        return this.catExamService.getItemExposureReport();
    }

    /**
     * [Admin] Test Information Function data for a specific item bank
     */
    @Roles(2)
    @Get('admin/bank/:bank_id/tif')
    async getBankTIF(@Param('bank_id') bankId: string) {
        return this.catExamService.getBankTIF(+bankId);
    }

    /**
     * [Admin] Trigger IRT calibration (calls irt_service)
     */
    @Roles(2)
    @Post('admin/trigger-calibration')
    async triggerCalibration(@Body() body: { bank_id?: number }) {
        return this.catExamService.triggerCalibration(body.bank_id);
    }
}
