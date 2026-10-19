import { PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePersonalEventDto {
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกชื่อกำหนดการ' })
  @MaxLength(200, { message: 'ชื่อกำหนดการยาวได้ไม่เกิน 200 ตัวอักษร' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'รายละเอียดยาวได้ไม่เกิน 1,000 ตัวอักษร' })
  description?: string;

  /** YYYY-MM-DD */
  @IsDateString({}, { message: 'วันที่เริ่มไม่ถูกต้อง' })
  start_date: string;

  /** YYYY-MM-DD — ไม่ใส่ = วันเดียวกับวันเริ่ม */
  @IsOptional()
  @IsDateString({}, { message: 'วันที่สิ้นสุดไม่ถูกต้อง' })
  end_date?: string;
}

export class UpdatePersonalEventDto extends PartialType(
  CreatePersonalEventDto,
) {}
