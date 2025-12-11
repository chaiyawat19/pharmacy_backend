import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Chat_session } from './entities/chat_session.entity';
import { Repository } from 'typeorm';
import { Chat_message } from './entities/chat_message.entity';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface MessageEvent {
    data: string | object;
}

@Injectable()
export class ChatService {
    constructor(
        private readonly httpService: HttpService,
        @InjectRepository(Chat_session)
        private readonly sessionRepo: Repository<Chat_session>,
        @InjectRepository(Chat_message)
        private readonly messageRepo: Repository<Chat_message>
    ) { }

    // เปลี่ยน Return Type เป็น Observable สำหรับ SSE
    async sendTon8nSSE(user_id: number, userMessage: string, token?: string): Promise<Observable<MessageEvent>> {
        // 1. หา Session (Code เดิมของคุณ)
        // const session = await this.getOrCreateSession(user_id); 
        const sessionId = 5; // Mock ไว้ก่อนตามตัวอย่าง

        const n8nUrl = 'https://cpkku.app.n8n.cloud/webhook/7c8ec1f6-d16c-4c40-8d0d-4e6e4b0186c1';
        const payload = {
            session_id: sessionId,
            message: userMessage
        };

        try {
            // 2. ยิง Request ไป n8n โดยบอกว่าขอ responseType เป็น 'stream'
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}), // ถ้ามี Token ก็ส่งไปด้วย
            };

            const response = await this.httpService.axiosRef.post(n8nUrl, payload, {
                headers: headers,
                responseType: 'stream',
            });

            // 3. สร้าง Observable เพื่อส่งข้อมูลกลับทีละก้อน
            return new Observable<MessageEvent>((observer) => {
                const stream = response.data;
                let buffer = ''; // เอาไว้พักเศษข้อมูลที่ยังมาไม่ครบ json

                stream.on('data', (chunk: Buffer) => {
                    // แปลง chunk เป็น string แล้วรวมกับ buffer เดิม
                    buffer += chunk.toString();

                    // n8n ส่งมาทีละบรรทัด แยกด้วย \n
                    const lines = buffer.split('\n');

                    // บรรทัดสุดท้ายอาจจะไม่สมบูรณ์ (incomplete) เก็บไว้ใน buffer รอรอบหน้า
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.trim()) { // ถ้าไม่ใช่บรรทัดว่าง
                            try {
                                const json = JSON.parse(line);

                                // กรองเอาเฉพาะ type: 'item' และดึง content ออกมา
                                if (json.type === 'item' && json.content) {
                                    // ส่งเฉพาะข้อความเนื้อหาไปให้ Frontend
                                    observer.next({ data: json.content });
                                }
                            } catch (e) {
                                console.error('Error parsing JSON line from n8n:', e);
                            }
                        }
                    }
                });

                stream.on('end', () => {
                    observer.complete(); // จบการทำงาน
                });

                stream.on('error', (err) => {
                    observer.error(err);
                });
            });

        } catch (error) {
            console.error('Error calling n8n:', error.message);
            throw new HttpException('Chat service unavailable', HttpStatus.BAD_GATEWAY);
        }
    }

    // ... method getOrCreateSession เดิมของคุณ ...
}