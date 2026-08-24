import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { University } from '../../universities/entities/university.entity';
import { Role } from '../../roles/entities/role.entity';
import { Exclude } from 'class-transformer';
import { Note } from 'src/notes/entities/note.entity';
import { Bookmark } from 'src/bookmark/entities/bookmark.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  user_id: number;

  @Column({ type: 'varchar', length: 255 })
  first_name: string;

  @Column({ type: 'varchar', length: 255 })
  last_name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  tel: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Exclude()
  password: string | null;

  @Column({ type: 'date', nullable: true })
  bod: Date | null;

  @Column({ type: 'integer', nullable: true })
  university_id: number | null;

  @ManyToOne(() => University, { nullable: true })
  @JoinColumn({ name: 'university_id' })
  university: University | null;

  @Column({ type: 'integer', default: 1 })
  role_id: number;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'local',
  })
  provider: 'local' | 'google';

  @Column({ type: 'text', nullable: true })
  profile_picture: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reset_password_token: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reset_password_expires: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  last_login_at: Date | null;

  @OneToMany(() => Note, (note) => note.user)
  notes: Note[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;

  @OneToMany(() => Bookmark, (bookmark) => bookmark.user)
  bookmarks: Bookmark[];
}
