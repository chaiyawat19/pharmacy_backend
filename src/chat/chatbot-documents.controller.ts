import { Controller, Get, Post, Delete, Param, UseInterceptors, UploadedFile, UseGuards, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatbotDocumentsService } from './chatbot-documents.service';
import { JwtAuthGuard } from '../common/guard/jwt-auth.guard';
import { Roles } from '../common/decorators/role.decorator';

@Controller('chatbot-documents')
@UseGuards(JwtAuthGuard)
export class ChatbotDocumentsController {
  constructor(private readonly chatbotDocumentsService: ChatbotDocumentsService) {}

  @Get()
  @Roles(2)
  async getAllDocuments() {
    return this.chatbotDocumentsService.getAllDocuments();
  }

  @Post('upload')
  @Roles(2)
  @UseInterceptors(FileInterceptor('file')) // รับจาก FormData ในคีย์ 'file'
  async uploadDocument(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    // req.user ได้มาจาก JwtAuthGuard (ที่มี userId ข้างใน)
    return this.chatbotDocumentsService.uploadAndProcessDocument(file, req.user.user_id);
  }

  @Delete(':id')
  @Roles(2)
  async deleteDocument(@Param('id') id: string) {
    return this.chatbotDocumentsService.deleteDocument(parseInt(id, 10));
  }
}
