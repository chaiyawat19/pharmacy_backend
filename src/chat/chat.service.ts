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
            botReply = response.data?.reply ?? '';


        } catch (error) {
            console.error('Error calling n8n:', error.message);
            botReply = 'ขออภัย เกิดข้อผิดพลาดในการประมวลผล (AI Service Error)';
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
            botReply = response.data?.reply ?? '';
        } catch (error) {
            console.error('Error calling n8n:', error.message);
            botReply = 'ขออภัย เกิดข้อผิดพลาดในการประมวลผล (AI Service Error)';
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

}

