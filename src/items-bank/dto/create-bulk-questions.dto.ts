import {
    IsNotEmpty,
    IsString,
    IsNumber,
    IsOptional,
    IsBoolean,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// DTO สำหรับ Answer Option แต่ละตัว
export class AnswerOptionDto {
    @IsOptional()
    @IsNumber()
    option_id?: number;

    @IsOptional()
    @IsNumber()
    item_id?: number;

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

// DTO สำหรับ Item/Question แต่ละข้อ
export class QuestionDto {
    @IsOptional()
    @IsNumber()
    item_id?: number;

    @IsOptional()
    @IsString()
    question_text?: string;

    @IsOptional()
    @IsString()
    explanation?: string;

    @IsOptional()
    @IsString()
    question_image_url?: string;

    @IsOptional()
    @IsNumber()
    irt_a_discrimination?: number;

    @IsOptional()
    @IsNumber()
    irt_b_difficulty?: number;

    @IsOptional()
    @IsNumber()
    irt_c_guessing?: number;

    @IsOptional()
    @IsNumber()
    sub_topic_id?: number;

    @IsOptional()
    @IsArray()
    sub_topic_ids?: number[];

    // Array ของ answer options สำหรับคำถามนี้
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AnswerOptionDto)
    answer_options: AnswerOptionDto[];
}

// DTO หลักสำหรับบันทึกทั้งหมด
export class CreateBulkQuestionsDto {
    @IsOptional()
    @IsNumber()
    situation_id?: number;

    @IsNotEmpty()
    @IsNumber()
    item_bank_id: number;

    // ข้อมูล Situation
    @IsOptional()
    @IsString()
    situation_text?: string;

    @IsOptional()
    @IsString()
    situation_image_url?: string;

    // Array ของคำถามทั้งหมด
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuestionDto)
    questions: QuestionDto[];
}
