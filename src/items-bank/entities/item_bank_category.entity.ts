import {
    Entity,
    PrimaryColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { ItemsBank } from './items-bank.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity('item_bank_category')
export class ItemBankCategory {
    @PrimaryColumn({ type: 'integer' })
    item_bank_id: number;

    @ManyToOne(() => ItemsBank)
    @JoinColumn({ name: 'item_bank_id' })
    item_bank: ItemsBank;

    @PrimaryColumn({ type: 'integer' })
    category_id: number;

    @ManyToOne(() => Category)
    @JoinColumn({ name: 'category_id' })
    category: Category;
}
