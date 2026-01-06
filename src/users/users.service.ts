import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }
  async findOneById(user_id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { user_id: user_id },
      relations: { university: true, role: true },
    });
  }
  async findAll() {
    const users = await this.userRepository.find({
      relations: { university: true, role: true },
    });
    console.log(users);
    return users;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: { university: true, role: true },
    });
    return user;
  }

  async register(createUserDto: CreateUserDto) {
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      role_id: 1, // Default role_id for new users
    });
    return await this.userRepository.save(user);
  }

  async validatePassword(
    password: string,
    hashedPassword: string | null,
  ): Promise<boolean> {
    if (!hashedPassword) return false; // Google user
    return bcrypt.compare(password, hashedPassword);
  }

  // users.service.ts
  async createSocialUser(data: {
    email: string;
    first_name: string;
    last_name: string;
    provider: 'google';
  }): Promise<User> {
    const user = this.userRepository.create({
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      provider: data.provider,
      role_id: 1,
      password: null, // Google ไม่มี password
    });

    return this.userRepository.save(user);
  }

  async updateProfile(
    user_id: number,
    updateData: UpdateUserDto,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { user_id },
      relations: { university: true, role: true },
    });

    if (!user) {
      throw new NotFoundException(`ไม่พบผู้ใช้งานด้วย ID ${user_id}`);
    }

    // ถ้ามีการเปลี่ยน email
    if (updateData.email) {
      const newEmail = updateData.email.trim().toLowerCase();
      const currentEmail = user.email.toLowerCase();

      if (newEmail !== currentEmail) {
        const existingUser = await this.userRepository.findOne({
          where: { email: newEmail },
        });

        console.log('UpdateProfile Debug:');
        console.log(
          'Current user id:',
          user_id,
          'Current email:',
          currentEmail,
        );
        console.log('New email:', newEmail);
        console.log('Existing user with new email:', existingUser);

        // ถ้าเจอ user คนอื่นที่ใช้ email นี้
        if (existingUser && existingUser.user_id !== user_id) {
          throw new ConflictException(
            'อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น',
          );
        }
      }

      updateData.email = newEmail;
    }

    // ไม่ให้ update password ตรงนี้
    delete updateData.password;

    Object.assign(user, updateData);
    const updatedUser = await this.userRepository.save(user);
    console.log('Updated user:', updatedUser);
    return updatedUser;
  }
}
