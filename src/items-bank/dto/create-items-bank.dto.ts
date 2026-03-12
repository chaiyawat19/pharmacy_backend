import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
} from 'class-validator';

export class CreateItemsBankDto {
  @IsNotEmpty()
  @IsString()
  bank_name: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsNumber()
  duration: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  category_ids?: number[];

  @IsOptional()
  @IsNotEmpty()
  is_active?: boolean;
}


