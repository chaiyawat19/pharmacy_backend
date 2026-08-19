import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  UnauthorizedException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) { }

  @UseGuards(JwtAuthGuard)
  @Delete('bulk/all')
  async removeAll(@Req() req) {
    const userId = req.user.userId;
    return this.schedulesService.remove(userId);
  }
  @UseGuards(JwtAuthGuard)
  @Patch('bulk/status') // Path สำหรับอัปเดตสถานะทั้งหมด
  async updateAllStatus(@Body('is_public') isPublic: boolean, @Req() req) {
    const userId = req.user.userId;
    return this.schedulesService.updateAllStatus(userId, isPublic);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateScheduleDto, @Req() req) {
    const userId = req.user.userId;
    if (!userId) {
      throw new UnauthorizedException('ไม่พบ userId ใน Token');
    }
    return this.schedulesService.create(dto, userId);
  }

  /**
   * อัปโหลดไฟล์ PDF ตารางสอบเพื่อให้ AI สกัดข้อมูล
   * S2.5: รับเฉพาะ PDF, ขนาดสูงสุด 20MB
   */
  @Post('upload')
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
        fileSize: 20 * 1024 * 1024, // 20MB max สำหรับ PDF
        files: 1,
      },
    }),
  )
  async uploadPdf(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('กรุณาอัปโหลดไฟล์ PDF');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const events = await this.schedulesService.extractEventsFromPdf(file);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return events;
  }

  @Public()
  @Get()
  findAll() {
    return this.schedulesService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.schedulesService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ) {
    return this.schedulesService.update(+id, updateScheduleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.schedulesService.remove(+id);
  }
}
