import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Delete,
  Put,
  ParseIntPipe,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * แชตบอต — ทุก endpoint ต้องเข้าสู่ระบบ (JwtAuthGuard เป็น global guard)
 *
 * ผู้ใช้เข้าถึงได้เฉพาะแชตของตัวเอง: ค่า user_id ใน URL/body ต้องตรงกับเจ้าของ token
 * และ session / ข้อความต้องเป็นของผู้ใช้คนนั้น (เดิมเชื่อค่าที่ส่งมาตรง ๆ ทำให้อ่าน/ลบ/แก้แชตของคนอื่นได้)
 * URL ยังรูปแบบเดิมเพื่อให้หน้าเว็บที่เรียกอยู่ใช้ต่อได้
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

  @Post('send/:session_id')
  async sendMessage(
    @Request() req,
    @Param('session_id') session_id: number,
    @Body('message') message: string,
  ) {
    const userId = req.user.userId;
    // ส่งต่อแชตเดิมได้เฉพาะแชตของตัวเอง ("null"/ว่าง = เริ่มแชตใหม่)
    if (session_id && !Number.isNaN(Number(session_id))) {
      await this.chatService.assertSessionOwner(Number(session_id), userId);
    }
    return this.chatService.sendMessageToN8N(userId, session_id, message);
  }

  @Get('message/:session_id')
  async getMessages(@Request() req, @Param('session_id') session_id: number) {
    // แอดมินดูประวัติแชตเพื่อตรวจคุณภาพคำตอบได้ (หน้า /admin/chatlog)
    if (Number(req.user.role_id) < 2) {
      await this.chatService.assertSessionOwner(
        Number(session_id),
        req.user.userId,
      );
    }
    return this.chatService.getMessages(session_id);
  }

  @Get('session/:user_id')
  async getSession(@Request() req, @Param('user_id') user_id: number) {
    this.assertSelf(req, user_id);
    return this.chatService.getSession(req.user.userId);
  }

  /** [Admin] แชตทั้งหมดของทุกคน */
  @Roles(2)
  @Get('sessions')
  async getAllSessions() {
    return this.chatService.getAllSessions();
  }

  @Delete('session/:session_id')
  async deleteSession(
    @Request() req,
    @Param('session_id', ParseIntPipe) session_id: number,
  ) {
    await this.chatService.assertSessionOwner(session_id, req.user.userId);
    return this.chatService.deleteSession(session_id);
  }

  @Put('message/:message_id')
  async editMessage(
    @Request() req,
    @Param('message_id') message_id: number,
    @Body('message') message: string,
  ) {
    await this.chatService.assertMessageOwner(
      Number(message_id),
      req.user.userId,
    );
    return this.chatService.editMessage(message_id, message);
  }
}
