import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  ParseIntPipe,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ChatService, ChatHistoryItem } from './chat.service';

/**
 * แชตบอต — ทุก endpoint ต้องเข้าสู่ระบบ (JwtAuthGuard เป็น global guard)
 *
 * ส่งข้อความแบบ stateless: ไม่เก็บประวัติใน DB
 * ประวัติ multi-turn ส่งมาจาก frontend เป็น history ชั่วคราวเท่านั้น
 * ผู้ใช้เข้าถึงได้เฉพาะ quota ของตัวเอง
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** ค่า user_id ใน URL ต้องเป็นของตัวเอง */
  private assertSelf(req: any, userId: number) {
    if (Number(userId) !== Number(req.user.userId)) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลแชตของผู้ใช้อื่น');
    }
  }

  @Get('quota/:user_id')
  async getQuota(
    @Request() req,
    @Param('user_id', ParseIntPipe) user_id: number,
  ) {
    this.assertSelf(req, user_id);
    return this.chatService.getUserQuota(req.user.userId);
  }

  @Post('cancel/:user_id')
  async cancelRequest(
    @Request() req,
    @Param('user_id', ParseIntPipe) user_id: number,
  ) {
    this.assertSelf(req, user_id);
    return this.chatService.cancelRequest(req.user.userId);
  }

  @Post('send')
  async sendMessage(
    @Request() req,
    @Body('message') message: string,
    @Body('history') history?: ChatHistoryItem[],
  ) {
    return this.chatService.sendMessageToN8N(
      req.user.userId,
      message,
      history,
    );
  }
}
