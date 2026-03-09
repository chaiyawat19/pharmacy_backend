import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/notification.dto';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepo: Repository<Notification>,
        private readonly notificationsGateway: NotificationsGateway,
    ) { }

    async create(createNotificationDto: CreateNotificationDto) {
        const notification = this.notificationRepo.create(createNotificationDto);
        const saved = await this.notificationRepo.save(notification);

        // Push real-time notification via WebSocket (non-blocking, won't fail the request)
        try {
            this.notificationsGateway.sendNotificationToUser(saved.user_id, {
                notification_id: saved.notification_id,
                title: saved.title,
                message: saved.message,
                link_url: saved.link_url,
                notification_type_id: saved.notification_type_id,
                created_at: saved.created_at,
                is_read: saved.is_read,
            });
        } catch (err) {
            console.error('[NotificationsService] Failed to push WebSocket notification:', err);
        }

        return saved;
    }


    async createAndBroadcast(createNotificationDto: Omit<CreateNotificationDto, 'user_id'>) {
        // For broadcast: create notification record for ALL users and push to all connected clients
        // We will just broadcast without persisting (used for news/exam set updates)
        const payload = {
            notification_id: 0,
            title: createNotificationDto.title,
            message: createNotificationDto.message,
            link_url: createNotificationDto.link_url,
            notification_type_id: createNotificationDto.notification_type_id,
            created_at: new Date(),
            is_read: false,
        };
        this.notificationsGateway.broadcastNotification(payload);
        return payload;
    }

    async findAllForUser(userId: number) {
        return await this.notificationRepo.find({
            where: { user_id: userId },
            order: { created_at: 'DESC' },
        });
    }

    async findUnreadCount(userId: number) {
        return await this.notificationRepo.count({
            where: { user_id: userId, is_read: false },
        });
    }

    async markAsRead(notificationId: number, userId: number) {
        const notification = await this.notificationRepo.findOne({
            where: { notification_id: notificationId, user_id: userId },
        });
        if (!notification) {
            throw new NotFoundException(`Notification with ID ${notificationId} not found`);
        }
        notification.is_read = true;
        notification.read_at = new Date();
        return await this.notificationRepo.save(notification);
    }

    async markAllAsRead(userId: number) {
        await this.notificationRepo.update(
            { user_id: userId, is_read: false },
            { is_read: true, read_at: new Date() },
        );
        return { message: 'All notifications marked as read' };
    }

    async remove(notificationId: number, userId: number) {
        const notification = await this.notificationRepo.findOne({
            where: { notification_id: notificationId, user_id: userId },
        });
        if (!notification) {
            throw new NotFoundException(`Notification with ID ${notificationId} not found`);
        }
        await this.notificationRepo.remove(notification);
        return { message: 'Notification deleted successfully' };
    }
}
