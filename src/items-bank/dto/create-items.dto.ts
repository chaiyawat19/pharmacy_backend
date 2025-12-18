import {
    IsNotEmpty,
    IsString,
    IsOptional,
    IsNumber,
} from 'class-validator';

export class CreateItemsDto {
    @IsNotEmpty()
    @IsNumber()
    item_bank_id: number;

    @IsNotEmpty()
    @IsNumber()
    display_order: number;

    @IsNotEmpty()
    @IsNumber()
    situation_id: number;

    @IsNotEmpty()
    @IsString()
    question_text: string;

    @IsNotEmpty()
    @IsString()
    question_type: string;

    @IsNotEmpty()
    @IsString()
    explanation: string;

    @IsOptional()
    @IsNumber()
    irt_a_discrimination: number;

    @IsOptional()
    @IsNumber()
    irt_b_difficulty: number;

    @IsOptional()
    @IsNumber()
    irt_c_guessing: number;

    @IsOptional()
    @IsNumber()
    sub_topic_id: number;
}


