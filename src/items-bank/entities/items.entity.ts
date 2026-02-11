import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn
} from 'typeorm';

import { ItemSituation } from './item_situations.entity';
import { AnswerOption } from './answer_options.entity';

@Entity('items')
export class Item {
    @PrimaryGeneratedColumn()
    item_id: number;

    @Column({ type: 'varchar', length: 255 })
    question_text: string;

    @Column({ type: 'float4', nullable: true })
    irt_a_discrimination?: number;

    @Column({ type: 'float4', nullable: true })
    irt_b_difficulty?: number;

    @Column({ type: 'float4', nullable: true })
    irt_c_guessing?: number;

    @Column({ type: 'varchar', length: 255 })
    explanation: string;

    @Column({ type: 'integer' })
    situation_id: number;

    @ManyToOne(() => ItemSituation)
    @JoinColumn({ name: 'situation_id' })
    situation: ItemSituation;

    @OneToMany(() => AnswerOption, (option) => option.item)
    answer_options: AnswerOption[];

    @Column({ type: 'varchar', length: 50, default: 'draft' })
    status: string;


    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;
}
