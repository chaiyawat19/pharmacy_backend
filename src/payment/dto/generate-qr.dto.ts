import { IsIn, IsOptional } from 'class-validator';

export class GenerateQrDto {
  @IsOptional()
  @IsIn(['promptpay', 'truewallet'])
  method?: 'promptpay' | 'truewallet';
}
