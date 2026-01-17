import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class StartCATExamDto {
    @IsNotEmpty()
    @IsNumber()
    item_bank_id: number;

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

    @IsOptional()
    @IsString()
    mode?: string; // 'real' | 'demo-easy' | 'demo-medium' | 'demo-hard'
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
