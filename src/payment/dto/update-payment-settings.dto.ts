import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdatePaymentSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'ราคาต้องมากกว่า 0 บาท' })
  @Max(1000000, { message: 'ราคาสูงเกินกว่าที่ระบบรองรับ' })
  annualPrice?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
