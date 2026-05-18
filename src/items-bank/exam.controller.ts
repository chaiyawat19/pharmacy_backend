import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards, Query } from '@nestjs/common';
import { ExamService } from './exam.service';
import { StartExamDto, SubmitExamDto } from './dto/exam.dto';
import { ExamHistoryFilterDto } from './dto/exam-history-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

/**
 * Controller for exam-related endpoints
 * These endpoints are accessible to all authenticated users
 */
@UseGuards(JwtAuthGuard)
@Controller('items-bank')
export class ExamController {
    constructor(private readonly examService: ExamService) { }

    /**
     * Start a new exam session
     * POST /items-bank/exam/start
     */
    @Post('exam/start')
    startExam(@Req() req, @Body() startExamDto: StartExamDto) {
        const userId = req.user.userId;
        return this.examService.startExam(userId, startExamDto);
    }

    /**
     * Submit exam answers
     * POST /items-bank/exam/:sessionId/submit
     */
    @Post('exam/:sessionId/submit')
    submitExam(@Req() req, @Param('sessionId') sessionId: string, @Body() submitExamDto: SubmitExamDto) {
        const userId = req.user.userId;
        return this.examService.submitExam(userId, +sessionId, submitExamDto);
    }

    /**
     * Cancel exam session (ออกกลางคัน — ไม่บันทึกประวัติ)
     * DELETE /items-bank/exam/:sessionId/cancel
     */
    @Delete('exam/:sessionId/cancel')
    cancelExam(@Req() req, @Param('sessionId') sessionId: string) {
        const userId = req.user.userId;
        return this.examService.cancelExam(userId, +sessionId);
    }

    /**
     * Get exam result
     * GET /items-bank/exam/:sessionId/result
     */
    @Get('exam/:sessionId/result')
    getExamResult(@Req() req, @Param('sessionId') sessionId: string) {
        const userId = req.user.userId;
        return this.examService.getExamResult(userId, +sessionId);
    }

    @Get('exam-result/:sessionId')
    getExamResultAlias(@Req() req, @Param('sessionId') sessionId: string) {
        const userId = req.user.userId;
        return this.examService.getExamResult(userId, +sessionId);
    }

    /**
     * Get user's exam history with optional filters
     * GET /items-bank/exam/history?category_ids=1,2&item_bank_id=3&status=COMPLETED
     */
    @Get('exam/history')
    getUserExamHistory(@Req() req, @Query() filters: ExamHistoryFilterDto) {
        const userId = req.user.userId;
        return this.examService.getUserExamHistory(userId, filters);
    }

    /**
     * Get categories that user has taken exams in
     * GET /items-bank/exam/categories
     */
    @Get('exam/categories')
    getUserExamCategories(@Req() req) {
        const userId = req.user.userId;
        return this.examService.getUserExamCategories(userId);
    }

    /**
     * Get user's item mastery statistics (all items)
     * GET /items-bank/mastery
     */
    @Get('mastery')
    getUserAllItemMastery(@Req() req) {
        const userId = req.user.userId;
        return this.examService.getUserItemMastery(userId);
    }

    /**
     * Get user's item mastery statistics (specific item)
     * GET /items-bank/mastery/:itemId
     */
    @Get('mastery/:itemId')
    getUserSingleItemMastery(@Req() req, @Param('itemId') itemId: string) {
        const userId = req.user.userId;
        return this.examService.getUserItemMastery(userId, +itemId);
    }
}
