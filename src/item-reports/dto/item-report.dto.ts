import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ITEM_REPORT_REASONS,
  ITEM_REPORT_STATUSES,
  type ItemReportReason,
  type ItemReportStatus,
} from '../entities/item-report.entity';

export class CreateItemReportDto {
  @IsInt()
  @Min(1)
  item_id: number;

  @IsIn(ITEM_REPORT_REASONS, { message: 'กรุณาเลือกประเภทปัญหา' })
  reason: ItemReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'รายละเอียดยาวได้ไม่เกิน 1,000 ตัวอักษร' })
  message?: string;
}

export class UpdateItemReportDto {
  @IsIn(ITEM_REPORT_STATUSES)
  status: ItemReportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  admin_note?: string;
}
