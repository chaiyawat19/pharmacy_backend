import {
    Entity,
    Column,
    PrimaryColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn
} from 'typeorm';

import { Item } from '../entities/items.entity';

@Entity('answer_options')
export class AnswerOption {
    @PrimaryColumn({ type: 'integer' })
    option_id: number;

    @PrimaryColumn({ type: 'integer' })
    item_id: number;

    @ManyToOne(() => Item)
    @JoinColumn({ name: 'item_id' })
    item: Item;

    @Column({ type: 'text' })
    option_text: string;

    @Column({ type: 'boolean' })

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;
}
