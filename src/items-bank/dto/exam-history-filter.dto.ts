import { IsOptional, IsArray, IsInt, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ExamHistoryFilterDto {
    @IsOptional()
    @IsArray()
    @Type(() => Number)
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            return value.split(',').map(id => parseInt(id.trim()));
        }
        return value;
    })
    category_ids?: number[];

    @IsOptional()
    @IsInt()
    @Type(() => Number)
    item_bank_id?: number;

    @IsOptional()
    @IsEnum(['ALL', 'COMPLETED', 'IN_PROGRESS'])
    status?: 'ALL' | 'COMPLETED' | 'IN_PROGRESS';
}
