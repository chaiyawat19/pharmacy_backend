import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('topics')
export class Topic {
    @PrimaryGeneratedColumn()
    topic_id: number;

    @Column({ type: 'text' })
    topic_name: string;

    @Column({ type: 'text' })
    description: string;

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;
}

