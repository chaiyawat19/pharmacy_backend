import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/notification.dto';

@Injectable()
export class NotificationsService {
    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepo: Repository<Notification>,
    ) { }

    async create(createNotificationDto: CreateNotificationDto) {
        const notification = this.notificationRepo.create(createNotificationDto);
        return await this.notificationRepo.save(notification);
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
