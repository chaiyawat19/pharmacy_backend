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
import { MSTService } from './mst.service';
import { StartMSTExamDto, SubmitMSTStageDto } from './dto/mst-exam.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('mst')
@UseGuards(JwtAuthGuard)
export class MSTController {
    constructor(private readonly mstService: MSTService) { }

    /**
     * เริ่มการสอบ MST
     */
    @Post('start')
    async startExam(@Request() req, @Body() startExamDto: StartMSTExamDto) {
        const userId = req.user.userId;
        return this.mstService.startMSTExam(userId, startExamDto);
    }

    /**
     * ดึงข้อสอบของ Stage ปัจจุบัน
     */
    @Get('session/:session_id/current-stage')
    async getCurrentStage(@Request() req, @Param('session_id') sessionId: string) {
        const userId = req.user.userId;
        return this.mstService.getCurrentStage(userId, +sessionId);
    }

    /**
     * ส่งคำตอบของ Stage ปัจจุบัน และประมวลผลเปลี่ยนด่าน
     */
    @Post('submit-stage')
    async submitStage(@Request() req, @Body() submitStageDto: SubmitMSTStageDto) {
        const userId = req.user.userId;
        return this.mstService.submitStage(userId, submitStageDto);
    }

    /**
     * ดูผลการสอบ MST
     */
    @Get('session/:session_id/result')
    async getExamResult(@Request() req, @Param('session_id') sessionId: string) {
        const userId = req.user.userId;
        return this.mstService.getExamResult(userId, +sessionId);
    }

    /**
     * ดูประวัติการสอบ MST ของผู้ใช้
     */
    @Get('history')
    async getExamHistory(@Request() req) {
        const userId = req.user.userId;
        return this.mstService.getUserMSTHistory(userId);
    }

    /**
     * ยกเลิก session การสอบ MST (ไม่บันทึกประวัติ)
     */
    @Delete('session/:session_id/cancel')
    async cancelSession(@Request() req, @Param('session_id') sessionId: string) {
        const userId = req.user.userId;
        return this.mstService.cancelMSTSession(userId, +sessionId);
    }

    // ==================== Admin endpoints ====================

    /**
     * [Admin] Session analytics overview
     */
    @Roles(2)
    @Get('admin/analytics')
    async getAdminAnalytics() {
        return this.mstService.getAdminAnalytics();
    }

    /**
     * [Admin] Check readiness of item bank for MST
     */
    @Roles(2)
    @Get('admin/readiness')
    async checkMSTReadiness(@Request() req) {
        const bankId = req.query.item_bank_id ? +req.query.item_bank_id : undefined;
        return this.mstService.checkMSTReadiness(bankId);
    }
}
