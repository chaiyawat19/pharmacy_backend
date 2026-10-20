import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ItemReportsService } from './item-reports.service';
import {
  CreateItemReportDto,
  UpdateItemReportDto,
} from './dto/item-report.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  ITEM_REPORT_STATUSES,
  type ItemReportStatus,
} from './entities/item-report.entity';

/**
 * แจ้งปัญหาข้อสอบ (เช่นแย้งเฉลย) — ผู้เรียนที่เข้าสู่ระบบส่งได้ (JwtAuthGuard เป็น global guard)
 * แอดมินดูรายการและปิดรายงาน
 */
@Controller('item-reports')
export class ItemReportsController {
  constructor(private readonly service: ItemReportsService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateItemReportDto) {
    return this.service.create(req.user.userId, dto);
  }

  @Roles(2)
  @Get()
  list(@Query('status') status?: string) {
    const valid = ITEM_REPORT_STATUSES.includes(status as ItemReportStatus)
      ? (status as ItemReportStatus)
      : undefined;
    return this.service.listForAdmin(valid);
  }

  @Roles(2)
  @Patch(':id')
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateItemReportDto,
  ) {
    return this.service.update(req.user.userId, id, dto);
  }
}
