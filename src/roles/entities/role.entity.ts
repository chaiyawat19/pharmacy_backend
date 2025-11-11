import { 
    Entity, 
    PrimaryGeneratedColumn,
    Column
} from "typeorm";

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn()
  role_id: number;

  @Column({ type: 'varchar', length: 255 })
  role_name: string;
}
