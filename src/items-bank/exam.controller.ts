import { Controller, Get, Post, Body, Param, Req, UseGuards, Query } from '@nestjs/common';
import { ItemsBankService } from './items-bank.service';
import { StartExamDto, SubmitExamDto } from './dto/exam.dto';
import { ExamHistoryFilterDto } from './dto/exam-history-filter.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Controller for exam-related endpoints
 * These endpoints are accessible to all authenticated users
 */
@UseGuards(JwtAuthGuard)
@Controller('items-bank')
export class ExamController {
    constructor(private readonly itemsBankService: ItemsBankService) { }

    /**
     * Start a new exam session
     * POST /items-bank/exam/start
     */
    @Post('exam/start')
    startExam(@Req() req, @Body() startExamDto: StartExamDto) {
        const userId = req.user.id;
        return this.itemsBankService.startExam(userId, startExamDto);
    }

    /**
     * Submit exam answers
     * POST /items-bank/exam/:sessionId/submit
     */
    @Post('exam/:sessionId/submit')
    submitExam(@Req() req, @Param('sessionId') sessionId: string, @Body() submitExamDto: SubmitExamDto) {
        const userId = req.user.id;
        return this.itemsBankService.submitExam(userId, +sessionId, submitExamDto);
    }

    /**
     * Get exam result
     * GET /items-bank/exam/:sessionId/result
     */
    @Get('exam/:sessionId/result')
    getExamResult(@Req() req, @Param('sessionId') sessionId: string) {
        const userId = req.user.id;
        return this.itemsBankService.getExamResult(userId, +sessionId);
    }

    @Get('exam-result/:sessionId')
    getExamResultAlias(@Req() req, @Param('sessionId') sessionId: string) {
        const userId = req.user.id;
        return this.itemsBankService.getExamResult(userId, +sessionId);
    }

    /**
     * Get user's exam history with optional filters
     * GET /items-bank/exam/history?category_ids=1,2&item_bank_id=3&status=COMPLETED
     */
    @Get('exam/history')
    getUserExamHistory(@Req() req, @Query() filters: ExamHistoryFilterDto) {
        const userId = req.user.id;
        return this.itemsBankService.getUserExamHistory(userId, filters);
    }

    /**
     * Get categories that user has taken exams in
     * GET /items-bank/exam/categories
     */
    @Get('exam/categories')
    getUserExamCategories(@Req() req) {
        const userId = req.user.id;
        return this.itemsBankService.getUserExamCategories(userId);
    }


    /**
     * Get user's item mastery statistics (all items)
     * GET /items-bank/mastery
     */
    @Get('mastery')
    getUserAllItemMastery(@Req() req) {
        const userId = req.user.id;
        return this.itemsBankService.getUserItemMastery(userId);
    }

    /**
     * Get user's item mastery statistics (specific item)
     * GET /items-bank/mastery/:itemId
     */
    @Get('mastery/:itemId')
    getUserSingleItemMastery(@Req() req, @Param('itemId') itemId: string) {
        const userId = req.user.id;
        return this.itemsBankService.getUserItemMastery(userId, +itemId);
    }
}
