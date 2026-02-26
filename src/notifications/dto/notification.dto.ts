import { IsNotEmpty, IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateNotificationDto {
    @IsNotEmpty()
    @IsNumber()
    user_id: number;

    @IsNotEmpty()
    @IsString()
    title: string;

    @IsNotEmpty()
    @IsString()
    message: string;

    @IsOptional()
    @IsNumber()
    notification_type_id?: number;

    @IsOptional()
    @IsString()
    link_url?: string;
}

export class UpdateNotificationDto {
    @IsOptional()
    @IsBoolean()
    is_read?: boolean;
}
