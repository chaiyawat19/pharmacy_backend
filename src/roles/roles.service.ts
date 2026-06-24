import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';

@Injectable()
export class RolesService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>
  ) {}

  async onApplicationBootstrap() {
    await this.seedRoles();
  }

  async seedRoles() {
    try {
      const studentRoleExists = await this.roleRepository.findOne({ where: { role_id: 1 } });
      if (!studentRoleExists) {
        console.log('--- Seeding Role student (1) ---');
        await this.roleRepository.save({ role_id: 1, role_name: 'student' });
      }
      const adminRoleExists = await this.roleRepository.findOne({ where: { role_id: 2 } });
      if (!adminRoleExists) {
        console.log('--- Seeding Role admin (2) ---');
        await this.roleRepository.save({ role_id: 2, role_name: 'admin' });
      }
    } catch (err) {
      console.error('Failed to seed roles:', err.message);
    }
  }
  create(createRoleDto: CreateRoleDto) {
    return 'This action adds a new role';
  }

  async findAll() {
    const roles = await this.roleRepository.find();
    console.log(roles);
    return roles;
  }

  findOne(id: number) {
    return `This action returns a #${id} role`;
  }

  update(id: number, updateRoleDto: UpdateRoleDto) {
    return `This action updates a #${id} role`;
  }

  remove(id: number) {
    return `This action removes a #${id} role`;
  }
}
