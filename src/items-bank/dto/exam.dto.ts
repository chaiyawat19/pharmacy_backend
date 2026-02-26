import { IsInt, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitAnswerDto {
    @IsInt()
    item_id: number;

    @IsInt()
    @IsOptional()
    selected_option_id?: number;

    @IsInt()
    @IsOptional()
    response_time_ms?: number;
}

export class StartExamDto {
    @IsInt()
    item_bank_id: number;
}

export class SubmitExamDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SubmitAnswerDto)
    answers: SubmitAnswerDto[];
}
