import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
    cors: {
        origin: '*',
        credentials: false,
    },
    namespace: '/notifications',
})
export class NotificationsGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(NotificationsGateway.name);

    // Map userId -> Set of socketIds
    private userSockets: Map<number, Set<string>> = new Map();

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {}

    afterInit(server: Server) {
        this.logger.log('NotificationsGateway initialized');
    }

    async handleConnection(client: Socket) {
        try {
            const token =
                (client.handshake.auth?.token as string) ||
                (client.handshake.headers?.authorization
                    ?.toString()
                    .replace('Bearer ', '') as string);

            if (!token) {
                this.logger.warn(`Client ${client.id} connected without token`);
                client.disconnect();
                return;
            }

            const payload = this.jwtService.verify(token, {
                secret: this.configService.get<string>('JWT_SECRET'),
            });

            // Force to number
            const userId: number = Number(payload.sub || payload.userId);
            client.data.userId = userId;

            if (!this.userSockets.has(userId)) {
                this.userSockets.set(userId, new Set());
            }
            this.userSockets.get(userId)!.add(client.id);

            // Join a personal room
            await client.join(`user_${userId}`);

            this.logger.log(
                `✅ Client ${client.id} joined room user_${userId} (payload.sub=${payload.sub}, type=${typeof payload.sub})`
            );
        } catch (err) {
            this.logger.warn(`Client ${client.id} auth failed: ${err}`);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        const userId: number = client.data.userId;
        if (userId && this.userSockets.has(userId)) {
            this.userSockets.get(userId)!.delete(client.id);
            if (this.userSockets.get(userId)!.size === 0) {
                this.userSockets.delete(userId);
            }
        }
        this.logger.log(`Client ${client.id} disconnected`);
    }

    // Send notification to a specific user
    sendNotificationToUser(
        userId: number,
        notification: {
            notification_id: number;
            title: string;
            message: string;
            link_url?: string;
            notification_type_id?: number;
            created_at: Date;
            is_read: boolean;
        },
    ) {
        if (!this.server) {
            this.logger.warn('WebSocket server not ready yet, skipping notification');
            return;
        }
        const room = `user_${userId}`;
        const connectedSockets = this.userSockets.get(Number(userId));
        this.logger.log(
            `📤 Sending to room ${room} | online sockets: ${connectedSockets?.size ?? 0}`
        );
        this.server.to(room).emit('new_notification', notification);
    }

    // Broadcast notification to all connected users
    broadcastNotification(notification: {
        notification_id: number;
        title: string;
        message: string;
        link_url?: string;
        notification_type_id?: number;
        created_at: Date;
        is_read: boolean;
    }) {
        if (!this.server) {
            this.logger.warn('WebSocket server not ready yet, skipping broadcast');
            return;
        }
        this.server.emit('new_notification', notification);
        this.logger.log('Broadcast notification to all users');
    }

    @SubscribeMessage('ping')
    handlePing(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
        client.emit('pong', { timestamp: new Date() });
    }
}
