import {
    Entity,
    Column,
    PrimaryColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn
} from 'typeorm';

import { ItemsBank } from '../entities/items-bank.entity';
import { Item } from '../entities/items.entity';

@Entity('item_bank_items')
export class ItemBankItem {
    @PrimaryColumn({ type: 'integer' })
    item_bank_id: number;

    @ManyToOne(() => ItemsBank)
    @JoinColumn({ name: 'item_bank_id' })
    item_bank: ItemsBank;

    @PrimaryColumn({ type: 'integer' })
    item_id: number;

    @ManyToOne(() => Item)
    @JoinColumn({ name: 'item_id' })
    item: Item;

    @Column({ type: 'integer' })
    display_order: number;

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;
}
