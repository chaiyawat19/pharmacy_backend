// pharmacy_backend\src\notes\dto\update-note.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateNoteDto } from './create-note.dto';
import { IsOptional } from 'class-validator';

export class UpdateNoteDto extends PartialType(CreateNoteDto) {
  @IsOptional()
  deletedFiles?: any; // เปลี่ยนจาก string[] เป็น any เพื่อรองรับ FormData
}
