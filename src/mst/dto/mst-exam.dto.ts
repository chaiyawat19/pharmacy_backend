import { IsNumber, IsOptional, IsArray, ValidateNested, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class StartMSTExamDto {
    @IsOptional()
    @IsNumber()
    item_bank_id?: number;

    @IsOptional()
    @IsNumber()
    total_stages?: number; // เช่น 2 หรือ 3

    @IsOptional()
    @IsNumber()
    items_per_stage?: number; // เช่น 10-15 ข้อ

    @IsOptional()
    @IsNumber()
    cut_score?: number; // ค่าเกณฑ์ตัดสิน เช่น 0.0

    @IsOptional()
    @IsNumber()
    initial_theta?: number;
}

export class MSTAnswerItemDto {
    @IsNumber()
    item_id: number;

    @IsNumber()
    selected_option_id: number;

    @IsOptional()
    @IsNumber()
    response_time_ms?: number;
}

export class SubmitMSTStageDto {
    @IsNumber()
    session_id: number;

    @IsNumber()
    stage_number: number;

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => MSTAnswerItemDto)
    answers: MSTAnswerItemDto[];
}
