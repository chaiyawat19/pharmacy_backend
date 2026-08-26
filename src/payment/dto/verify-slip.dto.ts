import { IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class VerifySlipDto {
  @IsNotEmpty()
  @IsNumberString()
  subscriptionId: string;

  @IsOptional()
  @IsString()
  payload?: string;

  @IsOptional()
  @IsString()
  base64?: string;

  @IsOptional()
  @IsString()
  url?: string;
}
