import { IsNotEmpty, IsNumber, IsOptional, IsString, IsObject } from 'class-validator';

export class StartCATExamDto {
    // item_bank_id ถูกลบออกแล้ว: CAT ดึงข้อสอบจากทุกคลัง (global pool) เสมอ

    @IsOptional()
    @IsNumber()
    initial_theta?: number;

    @IsOptional()
    @IsObject()
    topic_proportions?: Record<string, number>;

    @IsOptional()
    @IsNumber()
    min_items?: number;

    @IsOptional()
    @IsNumber()
    max_items?: number;

    @IsOptional()
    @IsNumber()
    target_se?: number;

    @IsOptional()
    @IsNumber()
    cut_score?: number;


}

export class SubmitCATAnswerDto {
    @IsNotEmpty()
    @IsNumber()
    session_id: number;

    @IsNotEmpty()
    @IsNumber()
    item_id: number;

    @IsNotEmpty()
    @IsNumber()
    selected_option_id: number;

    @IsOptional()
    @IsNumber()
    response_time_ms?: number;
}
