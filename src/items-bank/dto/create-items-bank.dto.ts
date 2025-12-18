import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class CreateItemsBankDto {
    @IsNotEmpty()
    @IsNumber()
    item_bank_id: number;

    @IsNotEmpty()
    @IsString()
    situation_title: string;

    @IsNotEmpty()
    @IsString()
    situation_text: string;

    @IsOptional()
    @IsString()
    situation_image_url: string;
}


