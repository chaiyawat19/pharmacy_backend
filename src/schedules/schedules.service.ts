import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { Schedule } from './entities/schedule.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class SchedulesService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
  ) { }

  async create(createScheduleDto: CreateScheduleDto, userId: number) {
    if (!userId) {
      throw new UnauthorizedException('ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่');
    }
    const newSchedule = this.scheduleRepo.create({
      ...createScheduleDto,
      user_id: userId
    });

    return await this.scheduleRepo.save(newSchedule);
  }

  findAll() {
    return this.scheduleRepo.find();
  }

  findOne(id: number) {
    return this.scheduleRepo.findOneBy({ id });
  }

  async update(id: number, dto: UpdateScheduleDto) {
    await this.scheduleRepo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.scheduleRepo.delete(id);
    return { deleted: true };
  }
}
