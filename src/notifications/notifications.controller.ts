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
import { CreateNotificationDto } from './dto/notification.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

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

    /** Send notification to specific user (admin only) */
    @Post('send')
    async create(@Body() dto: CreateNotificationDto) {
        try {
            return await this.notificationsService.create(dto);
        } catch (err) {
            console.error('[NotificationsController] POST /send error:', err);
            throw err;
        }
    }


    /** Broadcast to all connected users (admin only) */
    @Post('broadcast')
    broadcast(@Body() dto: Omit<CreateNotificationDto, 'user_id'>) {
        return this.notificationsService.createAndBroadcast(dto);
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
