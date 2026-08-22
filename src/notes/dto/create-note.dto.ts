import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุหัวข้อโน้ต' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุเนื้อหาโน้ต' })
  content: string;

  @IsOptional()
  @IsString()
  link_url?: string;

  @IsOptional()
  tagIds?: any; // รองรับ string, string[] และ number[]
}
