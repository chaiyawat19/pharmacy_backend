import { Controller, Get, Post, Delete, Param, UseInterceptors, UploadedFile, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatbotDocumentsService } from './chatbot-documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('chatbot-documents')
@UseGuards(JwtAuthGuard)
export class ChatbotDocumentsController {
  constructor(private readonly chatbotDocumentsService: ChatbotDocumentsService) {}

  @Get()
  @Roles(2)
  async getAllDocuments() {
    return this.chatbotDocumentsService.getAllDocuments();
  }

  /**
   * อัปโหลด PDF เข้า Pinecone — Admin เท่านั้น
   * S2.5: รับเฉพาะ PDF, ขนาดสูงสุด 20MB
   */
  @Post('upload')
  @Roles(2)
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(
            new BadRequestException('รองรับเฉพาะไฟล์ PDF เท่านั้น'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 20 * 1024 * 1024, // 20MB max
        files: 1,
      },
    }),
  )
  async uploadDocument(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    }
    return this.chatbotDocumentsService.uploadAndProcessDocument(file, req.user.userId);
  }

  @Delete(':id')
  @Roles(2)
  async deleteDocument(@Param('id') id: string) {
    return this.chatbotDocumentsService.deleteDocument(parseInt(id, 10));
  }
}
