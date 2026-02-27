import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
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

    @Column({ type: 'text' }) // เปลี่ยนจาก varchar เป็น text
    situation_text: string;

    @Column({ type: 'text', nullable: true }) // Image URL ก็ควรเผื่อไว้เผื่อยาวมาก
    situation_image_url: string;

    @Column({ type: 'integer', default: 1 })
    display_order: number;

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;
}
