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
} from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { JwtAuthGuard } from 'src/common/guard/jwt-auth.guard';
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

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPdf(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('กรุณาอัปโหลดไฟล์ PDF');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const events = await this.schedulesService.extractEventsFromPdf(file);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return events; // คืนค่าเป็น Array ออกไปตรงๆ เลย
  }

  @Get()
  findAll() {
    return this.schedulesService.findAll();
  }

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
