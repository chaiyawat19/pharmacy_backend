import { User } from "src/users/entities/user.entity";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('chat_sessions')
export class Chat_session {
  @PrimaryGeneratedColumn({ name: 'chat_session_id' })
  session_id: number;

  @Column({ type: 'integer' })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;
}
