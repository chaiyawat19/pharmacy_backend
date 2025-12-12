import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Chat_session } from './chat_session.entity';

@Entity('chat_messages')
export class Chat_message {
  @PrimaryGeneratedColumn()
  message_id: number;

  @Column({
    type: 'enum',
    enum: ['USER', 'BOT'],
  })
  sender_type: 'USER' | 'BOT';

  @Column({ type: 'text' })
  message_text: string;

  @Column({ type: 'integer' })
  chat_session_id: number;

  @ManyToOne(() => Chat_session, (session) => session.session_id)
  @JoinColumn({ name: 'chat_session_id' })
  chat_session: Chat_session;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  sent_at: Date;
}
