import { PartialType } from '@nestjs/mapped-types';
import { CreateNoteDto } from './create-note.dto';
import { IsOptional, IsArray } from 'class-validator';

export class UpdateNoteDto extends PartialType(CreateNoteDto) {
  @IsOptional()
  @IsArray()
  deletedFiles?: string[];
}
