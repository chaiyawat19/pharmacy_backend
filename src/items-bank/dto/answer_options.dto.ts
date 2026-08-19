import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional
} from 'class-validator';

export class CreateAnswerOptionDto {
    @IsNotEmpty()
    @IsNumber()
    item_id: number;

    @IsOptional()
    @IsString()
    option_text?: string;

    @IsNotEmpty()
    @IsBoolean()
    is_correct: boolean;

    @IsOptional()
    @IsString()
    option_image_url?: string;
}


