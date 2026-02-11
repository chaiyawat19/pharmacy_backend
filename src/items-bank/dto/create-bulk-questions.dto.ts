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
    @IsNotEmpty()
    @IsString()
    option_text: string;

    @IsNotEmpty()
    @IsBoolean()
    is_correct: boolean;
}

// DTO สำหรับ Item/Question แต่ละข้อ
export class QuestionDto {
    @IsNotEmpty()
    @IsString()
    question_text: string;

    @IsOptional()
    @IsString()
    explanation: string;

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

    // Array ของ answer options สำหรับคำถามนี้
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AnswerOptionDto)
    answer_options: AnswerOptionDto[];
}

// DTO หลักสำหรับบันทึกทั้งหมด
export class CreateBulkQuestionsDto {
    @IsNotEmpty()
    @IsNumber()
    item_bank_id: number;

    // ข้อมูล Situation
    @IsNotEmpty()
    @IsString()
    situation_text: string;

    @IsOptional()
    @IsString()
    situation_image_url?: string;

    // Array ของคำถามทั้งหมด
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuestionDto)
    questions: QuestionDto[];
}
