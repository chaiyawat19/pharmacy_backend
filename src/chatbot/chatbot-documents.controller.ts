import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatbotDocumentsService } from './chatbot-documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';

const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx'];

@Controller('chatbot-documents')
@UseGuards(JwtAuthGuard)
export class ChatbotDocumentsController {
  constructor(private readonly chatbotDocumentsService: ChatbotDocumentsService) {}

  @Get()
  @Roles(2)
  async getAllDocuments() {
    return this.chatbotDocumentsService.getAllDocuments();
  }

  @Get('deleted')
  @Roles(2)
  async getDeletedDocuments() {
    return this.chatbotDocumentsService.getDeletedDocuments();
  }

  @Get(':id/view')
  @Roles(2)
  async viewDocument(@Param('id') id: string, @Res() res: any) {
    const fileData = await this.chatbotDocumentsService.getDocumentFile(parseInt(id, 10));
    res.set({
      'Content-Type': fileData.contentType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileData.fileName)}"`,
    });
    res.send(fileData.buffer);
  }

  @Get(':id/download')
  @Roles(2)
  async downloadDocument(@Param('id') id: string, @Res() res: any) {
    const fileData = await this.chatbotDocumentsService.getDocumentFile(parseInt(id, 10));
    res.set({
      'Content-Type': fileData.contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileData.fileName)}"`,
    });
    res.send(fileData.buffer);
  }

  @Post('upload')
  @Roles(2)
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, cb) => {
        const cleanName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const ext = cleanName.split('.').pop()?.toLowerCase() || '';
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return cb(
            new BadRequestException(`รองรับเฉพาะไฟล์ ${ALLOWED_EXTENSIONS.map(e => '.' + e).join(', ')} เท่านั้น`),
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

  // ── Soft Delete ──
  @Delete(':id')
  @Roles(2)
  async softDeleteDocument(@Param('id') id: string) {
    return this.chatbotDocumentsService.softDeleteDocument(parseInt(id, 10));
  }

  @Post('batch-delete')
  @Roles(2)
  async batchSoftDelete(@Body('ids') ids: number[]) {
    return this.chatbotDocumentsService.softDeleteMultipleDocuments(ids);
  }

  // ── Restore ──
  @Post(':id/restore')
  @Roles(2)
  async restoreDocument(@Param('id') id: string) {
    return this.chatbotDocumentsService.restoreDocument(parseInt(id, 10));
  }

  @Post('batch-restore')
  @Roles(2)
  async batchRestore(@Body('ids') ids: number[]) {
    return this.chatbotDocumentsService.restoreMultipleDocuments(ids);
  }

  // ── Permanent Delete ──
  @Delete(':id/permanent')
  @Roles(2)
  async permanentDeleteDocument(@Param('id') id: string) {
    return this.chatbotDocumentsService.permanentDeleteDocument(parseInt(id, 10));
  }

  @Post('batch-permanent-delete')
  @Roles(2)
  async batchPermanentDelete(@Body('ids') ids: number[]) {
    return this.chatbotDocumentsService.permanentDeleteMultipleDocuments(ids);
  }
}
