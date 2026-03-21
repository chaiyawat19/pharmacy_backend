import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { UserDashboardService } from './user-dashboard.service'
import { JwtAuthGuard } from '../common/guard/jwt-auth.guard';
import express from 'express';

@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserDashboardController {
    constructor(private readonly userDashboardService: UserDashboardService) {}

    @Get('dashboard')
    async getDashboard(@Req() req: express.Request) {
        const userId = (req.user as any).id
    return this.userDashboardService.getUserDashboard(userId);
    }
}