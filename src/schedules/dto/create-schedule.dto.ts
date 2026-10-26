import { IsString, IsNotEmpty, IsOptional, IsArray, IsUrl, ValidateIf } from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  // ลิงก์แนบต้องเป็น URL ที่ขึ้นต้นด้วย http/https (ค่าว่างถือว่าไม่ใส่ลิงก์)
  @ValidateIf((o) => o.link_url !== undefined && o.link_url !== null && o.link_url !== '')
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }, { message: 'ลิงก์แนบต้องเป็น URL ที่ขึ้นต้นด้วย http:// หรือ https://' })
  link_url?: string;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  type_event?: string[];

  @IsOptional()
  is_public?: boolean;
}