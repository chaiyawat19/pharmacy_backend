import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    ManyToOne,
    JoinColumn
} from 'typeorm';

import { ItemsBank } from '../entities/items-bank.entity';

@Entity('item_situations')
export class ItemSituation {
    @PrimaryGeneratedColumn()
    situation_id: number;

    @Column({ type: 'integer' })
    item_bank_id: number;

    @ManyToOne(() => ItemsBank)
    @JoinColumn({ name: 'item_bank_id' })
    item_bank: ItemsBank;

    @Column({ type: 'text', nullable: true })
    situation_text?: string | null;

    @Column({ type: 'text', nullable: true })
    situation_image_url?: string | null;

    @Column({ type: 'integer', default: 1 })
    display_order: number;

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;

    @DeleteDateColumn({ type: 'timestamp with time zone', nullable: true })
    deleted_at: Date | null;
}
