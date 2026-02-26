import {
    IsNotEmpty,
    IsString,
    IsNumber,
    IsOptional,
} from 'class-validator';

export class CreateSituationDto {
    @IsNotEmpty()
    @IsNumber()
    item_bank_id: number;

    @IsNotEmpty()
    @IsString()
    situation_text: string;

    @IsOptional()
    @IsString()
    situation_image_url: string;
}

