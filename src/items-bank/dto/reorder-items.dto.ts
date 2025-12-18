import { IsArray, IsNotEmpty, IsNumber } from 'class-validator';

export class ReorderItemsDto {
    @IsNotEmpty()
    @IsNumber()
    item_bank_id: number;

    @IsNotEmpty()
    @IsArray()
    @IsNumber({}, { each: true })
    sorted_item_ids: number[];
}
