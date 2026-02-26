import {
    IsNotEmpty,
    IsNumber,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionDto } from './create-bulk-questions.dto';

export class AddQuestionsToSituationDto {
    @IsNotEmpty()
    @IsNumber()
    situation_id: number;

    @IsNotEmpty()
    @IsNumber()
    item_bank_id: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuestionDto)
    questions: QuestionDto[];
}
