import { IsString, IsOptional, IsNumber, IsArray, IsNotEmpty, IsUrl, ValidateIf } from 'class-validator';

export class CreateNewsDto {
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุหัวข้อข่าว' })
  title: string;

  // 💡 สำหรับ content ที่เป็น any (หรือ Rich Text Object) 
  // แนะนำให้ใส่ @IsNotEmpty() หรือ @IsOptional() ไว้ เพื่อให้ ValidationPipe รับรู้ตัวแปรนี้
  @IsNotEmpty()
  content: any;

  @IsString()
  @IsOptional()
  excerpt?: string;

  @IsNumber()
  author_id: number;

  @IsString()
  @IsOptional()
  cover_image_url?: string;

  // ลิงก์แหล่งข่าวต้องเป็น URL ที่ขึ้นต้นด้วย http/https (ค่าว่างถือว่าไม่ใส่ลิงก์)
  @ValidateIf((o) => o.source_url !== undefined && o.source_url !== null && o.source_url !== '')
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }, { message: 'ลิงก์แหล่งข่าวต้องเป็น URL ที่ขึ้นต้นด้วย http:// หรือ https://' })
  source_url?: string;

  @IsString()
  @IsOptional()
  status?: string;

  // 💡 สำหรับอาร์เรย์ตัวเลข (เช่น [1, 2, 3]) ต้องระบุให้ชัดเจน เพื่อให้ระบบ transform ทำงานถูกตัว
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  categoryIds?: number[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  tagIds?: number[];
}