import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Topic } from './topic.entity';

@Entity('sub_topics')
export class SubTopic {
    @PrimaryGeneratedColumn()
    sub_topic_id: number;

    @ManyToOne(() => Topic, (topic) => topic.topic_id)
    @JoinColumn({ name: 'topic_id' })
    topic: Topic;

    @Column({ type: 'integer' })
    topic_id: number;

    @Column({ type: 'text' })
    sub_topic_name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @CreateDateColumn({ type: 'timestamp with time zone' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp with time zone' })
    updated_at: Date;
}

