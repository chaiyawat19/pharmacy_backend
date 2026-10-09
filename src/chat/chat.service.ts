import { HttpException, HttpStatus, Injectable, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Chat_session } from './entities/chat_session.entity';
import { Repository } from 'typeorm';
import { Chat_message } from './entities/chat_message.entity';
import { Chat_quota } from './entities/chat_quota.entity';
import { firstValueFrom } from 'rxjs';

export const MAX_DAILY_CAPACITY_POINTS = 100; // 100% capacity
export const MAX_MESSAGE_LENGTH = 1000; // Max characters per message

export interface QuotaInfo {
    capacity_percentage: number; // % ใช้งานไปแล้ว (0 - 100)
    remaining_percentage: number; // % ที่เหลืออยู่ (0 - 100)
    used_points: number;
    max_points: number;
    message_count: number;
    is_limited: boolean;
    max_message_length: number;
    reset_at: string; // ISO string ของเที่ยงคืน
    reset_in_seconds: number;
}

@Injectable()
export class ChatService {
    // ── In-memory Concurrent Request Lock ──
    private readonly activeUsers = new Set<number>();
    // ── In-flight AbortControllers map: key = `${user_id}_${session_id}` ──
    private readonly inFlightControllers = new Map<string, AbortController>();

    constructor(
        private readonly httpService: HttpService,
        @InjectRepository(Chat_session)
        private readonly sessionRepo: Repository<Chat_session>,
        @InjectRepository(Chat_message)
        private readonly messageRepo: Repository<Chat_message>,
        @InjectRepository(Chat_quota)
        private readonly quotaRepo: Repository<Chat_quota>
    ) { }

    /**
     * ยกเลิกคำขอส่งข้อความที่กำลังประมวลผลอยู่ (Cancel in-flight request)
     */
    async cancelRequest(userId: number, sessionId?: number): Promise<{ success: boolean; message: string }> {
        let cancelled = false;

        // Cancel specific session or any active request of user
        for (const [key, controller] of this.inFlightControllers.entries()) {
            if (key.startsWith(`${userId}_`)) {
                controller.abort();
                this.inFlightControllers.delete(key);
                cancelled = true;
            }
        }

        // Release concurrent user lock
        this.activeUsers.delete(userId);

        return {
            success: true,
            message: cancelled ? 'Request cancelled successfully' : 'No active request to cancel'
        };
    }

    /**
     * คำนวณวันที่ปัจจุบันในรูปแบบ YYYY-MM-DD (ตาม Timezone ประเทศไทย UTC+7)
     */
    private getTodayString(): string {
        const now = new Date();
        // Offset to UTC+7
        const thaiTime = new Date(now.getTime() + 7 * 3600 * 1000);
        return thaiTime.toISOString().split('T')[0];
    }

    /**
     * คำนวณเวลาที่เหลือก่อนถึงเที่ยงคืน (00:00 น. ของวันถัดไปใน UTC+7)
     */
    private getResetTimeInfo(): { reset_at: string; reset_in_seconds: number } {
        const now = new Date();
        const thaiNow = new Date(now.getTime() + 7 * 3600 * 1000);

        // Next midnight in Thai Time
        const nextMidnight = new Date(thaiNow);
        nextMidnight.setUTCHours(24, 0, 0, 0);

        const diffMs = nextMidnight.getTime() - thaiNow.getTime();
        const reset_in_seconds = Math.max(0, Math.floor(diffMs / 1000));

        // Real UTC Date of reset
        const realResetDate = new Date(now.getTime() + diffMs);

        return {
            reset_at: realResetDate.toISOString(),
            reset_in_seconds,
        };
    }

    /**
     * คำนวณคะแนนที่ต้องใช้ตามขนาดความยาวข้อความ (Dynamic Capacity)
     */
    private calculateMessageCost(message: string): number {
        const len = (message || '').trim().length;
        if (len <= 250) return 2;     // สั้นทั่วไป (คุยได้ประมาณ 50 ข้อความ/วัน)
        if (len <= 600) return 3;     // ปานกลาง
        return 5;                    // ยาวเต็มที่ (601 - 1000 ตัวอักษร)
    }

    /**
     * ดึงข้อมูล Quota ประจำวันของผู้ใช้
     */
    async getUserQuota(userId: number): Promise<QuotaInfo> {
        if (!userId) {
            throw new BadRequestException('Invalid user_id');
        }

        const today = this.getTodayString();
        let quota = await this.quotaRepo.findOne({
            where: { user_id: userId, usage_date: today }
        });

        if (!quota) {
            quota = this.quotaRepo.create({
                user_id: userId,
                usage_date: today,
                used_points: 0,
                message_count: 0
            });
        }

        const usedPoints = quota.used_points || 0;
        const capacityPercentage = Math.min(100, Math.round((usedPoints / MAX_DAILY_CAPACITY_POINTS) * 100));
        const remainingPercentage = Math.max(0, 100 - capacityPercentage);
        const isLimited = capacityPercentage >= 100;
        const { reset_at, reset_in_seconds } = this.getResetTimeInfo();

        return {
            capacity_percentage: capacityPercentage,
            remaining_percentage: remainingPercentage,
            used_points: usedPoints,
            max_points: MAX_DAILY_CAPACITY_POINTS,
            message_count: quota.message_count || 0,
            is_limited: isLimited,
            max_message_length: MAX_MESSAGE_LENGTH,
            reset_at,
            reset_in_seconds
        };
    }

    /**
     * ตรวจสอบและหักโควตาการใช้งาน
     */
    private async checkAndConsumeQuota(userId: number, message: string): Promise<QuotaInfo> {
        const today = this.getTodayString();
        let quota = await this.quotaRepo.findOne({
            where: { user_id: userId, usage_date: today }
        });

        if (!quota) {
            quota = this.quotaRepo.create({
                user_id: userId,
                usage_date: today,
                used_points: 0,
                message_count: 0
            });
        }

        const currentPercentage = Math.min(100, Math.round(((quota.used_points || 0) / MAX_DAILY_CAPACITY_POINTS) * 100));
        const { reset_at, reset_in_seconds } = this.getResetTimeInfo();

        if (currentPercentage >= 100) {
            const hours = Math.floor(reset_in_seconds / 3600);
            const minutes = Math.floor((reset_in_seconds % 3600) / 60);
            throw new HttpException({
                statusCode: HttpStatus.TOO_MANY_REQUESTS,
                error: 'QUOTA_EXCEEDED',
                message: `คุณใช้งานความจุแชตบอตครบ 100% สำหรับวันนี้แล้ว กรุณารออีก ${hours > 0 ? `${hours} ชั่วโมง ` : ''}${minutes} นาที เพื่อรีเซ็ตความจุใหม่ในเวลา 00:00 น.`,
                reset_at,
                reset_in_seconds,
                capacity_percentage: 100
            }, HttpStatus.TOO_MANY_REQUESTS);
        }

        const cost = this.calculateMessageCost(message);
        quota.used_points = Math.min(MAX_DAILY_CAPACITY_POINTS, (quota.used_points || 0) + cost);
        quota.message_count = (quota.message_count || 0) + 1;
        await this.quotaRepo.save(quota);

        const newPercentage = Math.min(100, Math.round((quota.used_points / MAX_DAILY_CAPACITY_POINTS) * 100));

        return {
            capacity_percentage: newPercentage,
            remaining_percentage: Math.max(0, 100 - newPercentage),
            used_points: quota.used_points,
            max_points: MAX_DAILY_CAPACITY_POINTS,
            message_count: quota.message_count,
            is_limited: newPercentage >= 100,
            max_message_length: MAX_MESSAGE_LENGTH,
            reset_at,
            reset_in_seconds
        };
    }

    /**
     * ส่งข้อความไปยัง AI (พร้อม Concurrent Lock, Message Length Cap และ Dynamic Quota)
     */
    async sendMessageToN8N(user_id: number, session_id: number, message: string): Promise<any> {
        // 1. ตรวจสอบ Message Length Cap
        if (!message || message.trim().length === 0) {
            throw new BadRequestException('กรุณาระบุข้อความ');
        }

        if (message.length > MAX_MESSAGE_LENGTH) {
            throw new BadRequestException(`ข้อความมีความยาวเกินกำหนด (สูงสุด ${MAX_MESSAGE_LENGTH} ตัวอักษร)`);
        }

        // 2. ตรวจสอบ Concurrent Request Lock (1 Request ต่อ 1 User)
        if (this.activeUsers.has(user_id)) {
            throw new HttpException({
                statusCode: HttpStatus.TOO_MANY_REQUESTS,
                error: 'CONCURRENT_REQUEST_LIMIT',
                message: 'กำลังประมวลผลข้อความก่อนหน้า กรุณารอสักครู่ก่อนส่งข้อความใหม่'
            }, HttpStatus.TOO_MANY_REQUESTS);
        }

        // 3. ล็อค Concurrent Lock
        this.activeUsers.add(user_id);
        const controller = new AbortController();
        const inFlightKey = `${user_id}_${session_id || 'new'}`;
        this.inFlightControllers.set(inFlightKey, controller);

        try {
            // 4. ตรวจสอบและหัก Dynamic Quota
            const quotaInfo = await this.checkAndConsumeQuota(user_id, message);

            if (!session_id || session_id.toString() === 'null' || Number.isNaN(Number(session_id))) {
                const newSession = await this.sessionRepo.save({
                    user_id: user_id,
                    title: message.slice(0, 50)
                });
                session_id = newSession.session_id;
            }

            const savedUserMessage = await this.messageRepo.save({
                chat_session_id: session_id,
                message_text: message,
                sender_type: 'USER'
            });

            // If cancelled before reaching N8N
            if (controller.signal.aborted) {
                return { user: savedUserMessage, cancelled: true };
            }

            const n8nUrl = 'https://cpkku.app.n8n.cloud/webhook/7c8ec1f6-d16c-4c40-8d0d-4e6e4b0186c1';
            let botReply = '';
            const payload = { user_id, session_id, message };

            try {
                const response = await firstValueFrom(
                    this.httpService.post(n8nUrl, payload, { signal: controller.signal })
                );
                const data = response.data;

                if (data?.status === 'error') {
                    botReply = this.formatN8NErrorMessage(data);
                } else {
                    botReply = this.cleanBotReply(data?.reply ?? '');
                }

                if (!botReply) {
                    botReply = response.data?.reply ?? '';
                }
            } catch (error: any) {
                if (controller.signal.aborted || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
                    console.log(`[ChatService] N8N request was cancelled by user ${user_id}`);
                    return {
                        user: savedUserMessage,
                        cancelled: true,
                        quota: quotaInfo
                    };
                }
                botReply = this.handleN8NError(error);
            }

            // Check again if cancelled before saving
            if (controller.signal.aborted) {
                return {
                    user: savedUserMessage,
                    cancelled: true,
                    quota: quotaInfo
                };
            }

            const savedBotMessage = await this.messageRepo.save({
                chat_session_id: session_id,
                message_text: botReply,
                sender_type: 'BOT'
            });

            return {
                user: savedUserMessage,
                bot: savedBotMessage,
                quota: quotaInfo
            };
        } finally {
            // ปลดล็อค Concurrent Lock & cleanup controller
            this.activeUsers.delete(user_id);
            this.inFlightControllers.delete(inFlightKey);
        }
    }

    // ดึงข้อมูลแชตทั้งหมดภายใน session
    async getMessages(session_id: number) {
        return this.messageRepo.find({
            where: { chat_session_id: session_id },
            order: { sent_at: "DESC" }
        });
    }

    async getSession(user_id: number) {
        return this.sessionRepo.findAndCount({
            where: { user_id },
            order: { created_at: "DESC" }
        });
    }

    async deleteSession(session_id: number) {
        const id = Number(session_id);
        if (!id || Number.isNaN(id)) {
            throw new BadRequestException('รหัส Session ไม่ถูกต้อง');
        }

        // ยกเลิก in-flight controller หากมีคำขอกำลังประมวลผลใน session นี้
        for (const [key, controller] of this.inFlightControllers.entries()) {
            if (key.endsWith(`_${id}`)) {
                controller.abort();
                this.inFlightControllers.delete(key);
            }
        }

        // 1. ลบข้อความทั้งหมดที่ผูกกับ session นี้ก่อน เพื่อป้องกัน Foreign Key Constraint Error
        await this.messageRepo.delete({ chat_session_id: id });

        // 2. ลบตัว session ด้วย primary key
        const result = await this.sessionRepo.delete(id);

        // Fallback: หาก affected เป็น 0 ให้ลบผ่าน queryBuilder อ้างอิง column chat_session_id โดยตรง
        if (!result.affected) {
            await this.sessionRepo
                .createQueryBuilder()
                .delete()
                .from(Chat_session)
                .where("chat_session_id = :id", { id })
                .execute();
        }

        return {
            success: true,
            affected: result.affected ?? 1,
            message: 'ลบประวัติการสนทนาเรียบร้อยแล้ว'
        };
    }

    async getAllSessions() {
        return this.sessionRepo.find({
            order: { created_at: "DESC" },
            relations: ['user']
        });
    }

    async editMessage(message_id: number, message_text: string) {
        if (!message_text || message_text.trim().length === 0) {
            throw new BadRequestException('กรุณาระบุข้อความ');
        }

        if (message_text.length > MAX_MESSAGE_LENGTH) {
            throw new BadRequestException(`ข้อความมีความยาวเกินกำหนด (สูงสุด ${MAX_MESSAGE_LENGTH} ตัวอักษร)`);
        }

        const existingMessage = await this.messageRepo.findOne({
            where: { message_id },
            relations: ['chat_session']
        });

        if (!existingMessage) {
            throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
        }

        const user_id = existingMessage.chat_session.user_id;

        // Concurrent Request Lock
        if (this.activeUsers.has(user_id)) {
            throw new HttpException({
                statusCode: HttpStatus.TOO_MANY_REQUESTS,
                error: 'CONCURRENT_REQUEST_LIMIT',
                message: 'กำลังประมวลผลข้อความก่อนหน้า กรุณารอสักครู่'
            }, HttpStatus.TOO_MANY_REQUESTS);
        }

        this.activeUsers.add(user_id);

        try {
            // Check & consume quota
            const quotaInfo = await this.checkAndConsumeQuota(user_id, message_text);

            existingMessage.message_text = message_text;
            const updatedUserMessage = await this.messageRepo.save(existingMessage);

            const session_id = existingMessage.chat_session_id;
            const n8nUrl = 'https://cpkku.app.n8n.cloud/webhook/7c8ec1f6-d16c-4c40-8d0d-4e6e4b0186c1';
            let botReply = '';
            const payload = { user_id, session_id, message: message_text };

            try {
                const response = await firstValueFrom(this.httpService.post(n8nUrl, payload));
                const data = response.data;

                if (data?.status === 'error') {
                    botReply = this.formatN8NErrorMessage(data);
                } else {
                    botReply = this.cleanBotReply(data?.reply ?? '');
                }
            } catch (error) {
                botReply = this.handleN8NError(error);
            }

            const savedBotMessage = await this.messageRepo.save({
                chat_session_id: session_id,
                message_text: botReply,
                sender_type: 'BOT'
            });

            return {
                user: updatedUserMessage,
                bot: savedBotMessage,
                quota: quotaInfo
            };
        } finally {
            this.activeUsers.delete(user_id);
        }
    }

    private cleanBotReply(reply: string): string {
        return reply.replace(/^\[Used tools:[\s\S]*?\]\]\s*/i, '').trim();
    }

    private handleN8NError(error: any): string {
        console.error('Full Error from n8n:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });

        if (error.response?.data?.status === 'error') {
            return this.formatN8NErrorMessage(error.response.data);
        }

        const status = error.response?.status;

        if (status === 429) {
            return 'ขณะนี้มีการเรียกใช้งาน AI ถี่เกินไป (Rate Limit) กรุณารอสัก 1-2 นาทีแล้วลองใหม่อีกครั้งครับ';
        }

        if (status >= 500) {
            return 'ระบบประมวลผล AI (n8n) ขัดข้องชั่วคราว กำลังเร่งแก้ไขครับ';
        }

        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return 'การเชื่อมต่อกับ AI ใช้เวลานานเกินไป กรุณาลองส่งข้อความใหม่อีกครั้งครับ';
        }

        return `เกิดข้อผิดพลาดในการสื่อสารกับ AI (${error.message})`;
    }

    private formatN8NErrorMessage(data: any): string {
        const msg = data.error_message || 'เกิดข้อผิดพลาดในการประมวลผล';
        const desc = data.error_description ? ` (${data.error_description})` : '';

        if (msg.includes('too many requests') || msg.includes('limit')) {
            return 'ขณะนี้ AI มีผู้ใช้งานจำนวนมาก (Rate Limit) กรุณาเว้นระยะเวลาสักครู่แล้วส่งใหม่ครับ';
        }

        return `AI แจ้งข้อผิดพลาด: ${msg}${desc}`;
    }
}
