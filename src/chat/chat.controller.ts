import { Controller, Post, Body, Param, Get, Delete, Put, ParseIntPipe } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @Get('quota/:user_id')
  async getQuota(
    @Param('user_id', ParseIntPipe) user_id: number
  ) {
    return this.chatService.getUserQuota(user_id);
  }

  @Post('cancel/:user_id')
  async cancelRequest(
    @Param('user_id', ParseIntPipe) user_id: number
  ) {
    return this.chatService.cancelRequest(user_id);
  }

  @Post('send/:session_id')
  async sendMessage(
    @Param('session_id') session_id: number,
    @Body('user_id') user_id: number,
    @Body('message') message: string,
  ) {
    return this.chatService.sendMessageToN8N(user_id, session_id, message);
  }

  @Get('message/:session_id')
  async getMessages(
    @Param('session_id') session_id: number
  ) {
    return this.chatService.getMessages(session_id);
  }

  @Get('session/:user_id')
  async getSession(
    @Param('user_id') user_id: number
  ) {
    return this.chatService.getSession(user_id);
  }

  @Get('sessions')
  async getAllSessions() {
    return this.chatService.getAllSessions();
  }

  @Delete('session/:session_id')
  async deleteSession(
    @Param('session_id', ParseIntPipe) session_id: number
  ) {
    return this.chatService.deleteSession(session_id);
  }

  @Put('message/:message_id')
  async editMessage(
    @Param('message_id') message_id: number,
    @Body('message') message: string,
  ) {
    return this.chatService.editMessage(message_id, message);
  }
}