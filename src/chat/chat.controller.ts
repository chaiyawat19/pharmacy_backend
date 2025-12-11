import { Controller, Sse, Query, MessageEvent, Request } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  // ใช้ @Sse ต้อง return Observable<MessageEvent>
  // ตัวอย่าง URL: http://localhost:3000/chat/stream?userId=1&message=สวัสดี
  @Sse('stream')
  streamChat(
    @Query('userId') userId: number,
    @Query('message') message: string,
    @Request() req
  ): Promise<Observable<MessageEvent>> {
    // ดึง Token จาก Header "Authorization: Bearer <token>"
    const token = req.headers.authorization?.split(' ')[1];
    return this.chatService.sendTon8nSSE(userId, message, token);
  }
}