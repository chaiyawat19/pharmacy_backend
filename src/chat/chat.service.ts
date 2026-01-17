import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Chat_session } from './entities/chat_session.entity';
import { Repository } from 'typeorm';
import { Chat_message } from './entities/chat_message.entity';
import { firstValueFrom } from 'rxjs';


@Injectable()
export class ChatService {
    constructor(
        private readonly httpService: HttpService,
        @InjectRepository(Chat_session)
        private readonly sessionRepo: Repository<Chat_session>,
        @InjectRepository(Chat_message)
        private readonly messageRepo: Repository<Chat_message>
    ) { }

    // ส่งข้อความไปยัง n8n 2 รอบ
    async sendMessageToN8N(user_id: number, session_id: number, message: string): Promise<any> {

        if (!session_id || session_id.toString() === 'null' || Number.isNaN(Number(session_id))) {
            const newSession = await this.sessionRepo.save({
                user_id: user_id,
                title: message.slice(0, 50) // ชื่อ session จากข้อความแรก
            });
            console.log(newSession);
            session_id = newSession.session_id;
        }

        const savedUserMessage = await this.messageRepo.save({
            chat_session_id: session_id,
            message_text: message,
            sender_type: 'USER'
        });

        const n8nUrl = 'https://cpkku.app.n8n.cloud/webhook/7c8ec1f6-d16c-4c40-8d0d-4e6e4b0186c1';
        let botReply = '';

        const payload = {
            user_id: user_id,
            session_id: session_id,
            message: message
        };

        try {
            const response = await firstValueFrom(this.httpService.post(n8nUrl, payload));
            const data = response.data;

            // เช็คว่า n8n ส่ง error JSON กลับมาหรือไม่
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
            user: savedUserMessage,
            bot: savedBotMessage
        }
    }

    // ดึงข้อมูลแชททั้งหมดภายใน session
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
        return this.sessionRepo.delete({ session_id });
    }

    async getAllSessions() {
        return this.sessionRepo.find({
            order: { created_at: "DESC" },
            relations: ['user']
        });
    }

    async editMessage(message_id: number, message_text: string) {
        // 1. ค้นหาข้อความเดิมเพื่อเอา session_id และ user_id
        const existingMessage = await this.messageRepo.findOne({
            where: { message_id },
            relations: ['chat_session'] // Join ไปตาราง session เพื่อเอา user_id
        });

        if (!existingMessage) {
            throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
        }

        // 2. อัปเดตข้อความของผู้ใช้ (Edit)
        existingMessage.message_text = message_text;
        const updatedUserMessage = await this.messageRepo.save(existingMessage);

        // 3. เตรียมข้อมูลส่ง n8n (Manual Call เพื่อไม่ให้ save ข้อความ User ซ้ำ)
        const session_id = existingMessage.chat_session_id;
        const user_id = existingMessage.chat_session.user_id;
        const n8nUrl = 'https://cpkku.app.n8n.cloud/webhook/7c8ec1f6-d16c-4c40-8d0d-4e6e4b0186c1';
        let botReply = '';

        const payload = {
            user_id: user_id,
            session_id: session_id,
            message: message_text
        };

        try {
            const response = await firstValueFrom(this.httpService.post(n8nUrl, payload));
            const data = response.data;

            // เช็คว่า n8n ส่ง error JSON กลับมาหรือไม่
            if (data?.status === 'error') {
                botReply = this.formatN8NErrorMessage(data);
            } else {
                botReply = this.cleanBotReply(data?.reply ?? '');
            }
        } catch (error) {
            botReply = this.handleN8NError(error);
        }

        // 4. บันทึกเฉพาะข้อความจาก Bot ใหม่
        const savedBotMessage = await this.messageRepo.save({
            chat_session_id: session_id,
            message_text: botReply,
            sender_type: 'BOT'
        });

        return {
            user: updatedUserMessage,
            bot: savedBotMessage
        };
    }

    private cleanBotReply(reply: string): string {
        // ลบข้อความประเภท [Used tools: ... ]] ออก (รวมถึงขึ้นบรรทัดใหม่ที่ตามมา)
        return reply.replace(/^\[Used tools:[\s\S]*?\]\]\s*/i, '').trim();
    }

    private handleN8NError(error: any): string {
        console.error('Full Error from n8n:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });

        // ถ้า n8n ส่ง error JSON มาใน response.data ของ axios error
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

        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            return 'การเชื่อมต่อกับ AI ใช้เวลานานเกินไป กรุณาลองส่งข้อความใหม่อีกครั้งครับ';
        }

        return `เกิดข้อผิดพลาดในการสื่อสารกับ AI (${error.message})`;
    }

    private formatN8NErrorMessage(data: any): string {
        const msg = data.error_message || 'เกิดข้อผิดพลาดในการประมวลผล';
        const desc = data.error_description ? ` (${data.error_description})` : '';

        // ถ้าเป็นเรื่อง Rate Limit จากข้างใน n8n
        if (msg.includes('too many requests') || msg.includes('limit')) {
            return 'ขณะนี้ AI มีผู้ใช้งานจำนวนมาก (Rate Limit) กรุณาเว้นระยะเวลาสักครู่แล้วส่งใหม่ครับ';
        }

        return `AI แจ้งข้อผิดพลาด: ${msg}${desc}`;
    }
}

