import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guard/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get()
    findAll(@Request() req) {
        const userId = req.user.userId;
        return this.notificationsService.findAllForUser(userId);
    }

    @Get('unread-count')
    getUnreadCount(@Request() req) {
        const userId = req.user.userId;
        return this.notificationsService.findUnreadCount(userId);
    }

    @Patch(':id/read')
    markAsRead(@Param('id') id: string, @Request() req) {
        const userId = req.user.userId;
        return this.notificationsService.markAsRead(+id, userId);
    }

    @Post('read-all')
    markAllAsRead(@Request() req) {
        const userId = req.user.userId;
        return this.notificationsService.markAllAsRead(userId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Request() req) {
        const userId = req.user.userId;
        return this.notificationsService.remove(+id, userId);
    }
}
