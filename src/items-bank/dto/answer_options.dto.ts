import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsBoolean
} from 'class-validator';

export class CreateAnswerOptionDto {
    @IsNotEmpty()
    @IsNumber()
    item_id: number;

    @IsNotEmpty()
    @IsString()
    option_text: string;

    @IsNotEmpty()
    @IsBoolean()
    is_correct: boolean;

}


