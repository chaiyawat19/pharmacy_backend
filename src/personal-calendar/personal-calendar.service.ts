import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PersonalEvent } from './entities/personal-event.entity';
import { ScheduleMark } from './entities/schedule-mark.entity';
import { Schedule } from '../schedules/entities/schedule.entity';
import {
  CreatePersonalEventDto,
  UpdatePersonalEventDto,
} from './dto/personal-event.dto';

/** จำกัดจำนวนกำหนดการส่วนตัวต่อคน กันข้อมูลบวมจากการสร้างไม่หยุด */
const MAX_EVENTS_PER_USER = 500;

const toDateOnly = (value: string) => value.slice(0, 10);

@Injectable()
export class PersonalCalendarService {
  constructor(
    @InjectRepository(PersonalEvent)
    private readonly eventRepo: Repository<PersonalEvent>,
    @InjectRepository(ScheduleMark)
    private readonly markRepo: Repository<ScheduleMark>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
  ) {}

  /** กำหนดการส่วนตัว + รหัสกำหนดการของแอดมินที่มาร์คไว้ ของผู้ใช้คนนี้เท่านั้น */
  async getMyCalendar(userId: number) {
    const [events, marks] = await Promise.all([
      this.eventRepo.find({
        where: { userId },
        order: { startDate: 'ASC', id: 'ASC' },
      }),
      this.markRepo.find({ where: { userId } }),
    ]);
    return {
      events: events.map((e) => this.serialize(e)),
      marked_schedule_ids: marks.map((m) => m.scheduleId),
    };
  }

  async createEvent(userId: number, dto: CreatePersonalEventDto) {
    const count = await this.eventRepo.count({ where: { userId } });
    if (count >= MAX_EVENTS_PER_USER) {
      throw new BadRequestException(
        `สร้างกำหนดการส่วนตัวได้ไม่เกิน ${MAX_EVENTS_PER_USER} รายการ`,
      );
    }
    const startDate = toDateOnly(dto.start_date);
    const endDate = toDateOnly(dto.end_date || dto.start_date);
    this.assertRange(startDate, endDate);

    const saved = await this.eventRepo.save(
      this.eventRepo.create({
        userId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        startDate,
        endDate,
      }),
    );
    return this.serialize(saved);
  }

  async updateEvent(userId: number, id: number, dto: UpdatePersonalEventDto) {
    const event = await this.findOwnEvent(userId, id);
    if (dto.title !== undefined) {
      if (!dto.title.trim())
        throw new BadRequestException('กรุณากรอกชื่อกำหนดการ');
      event.title = dto.title.trim();
    }
    if (dto.description !== undefined)
      event.description = dto.description.trim() || null;
    if (dto.start_date !== undefined)
      event.startDate = toDateOnly(dto.start_date);
    if (dto.end_date !== undefined) event.endDate = toDateOnly(dto.end_date);
    this.assertRange(event.startDate, event.endDate);

    return this.serialize(await this.eventRepo.save(event));
  }

  async deleteEvent(userId: number, id: number) {
    const event = await this.findOwnEvent(userId, id);
    await this.eventRepo.remove(event);
    return { success: true };
  }

  /** มาร์คกำหนดการของแอดมิน (ทำซ้ำได้ ไม่ error) */
  async mark(userId: number, scheduleId: number) {
    const schedule = await this.scheduleRepo.findOne({
      where: { id: scheduleId },
    });
    if (!schedule || !schedule.is_public || schedule.is_draft) {
      throw new NotFoundException('ไม่พบกำหนดการนี้');
    }
    await this.markRepo.upsert({ userId, scheduleId }, [
      'userId',
      'scheduleId',
    ]);
    return { schedule_id: scheduleId, marked: true };
  }

  async unmark(userId: number, scheduleId: number) {
    await this.markRepo.delete({ userId, scheduleId });
    return { schedule_id: scheduleId, marked: false };
  }

  // ── ตัวช่วย ────────────────────────────────────────────────────────────────

  /** หาเฉพาะของเจ้าของ — ของคนอื่นตอบว่าไม่พบ ไม่บอกว่ามีอยู่ */
  private async findOwnEvent(userId: number, id: number) {
    const event = await this.eventRepo.findOne({ where: { id, userId } });
    if (!event) throw new NotFoundException('ไม่พบกำหนดการส่วนตัวนี้');
    return event;
  }

  private assertRange(start: string, end: string) {
    if (end < start) {
      throw new BadRequestException('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
    }
  }

  private serialize(e: PersonalEvent) {
    return {
      id: e.id,
      title: e.title,
      description: e.description ?? '',
      start_date: e.startDate,
      end_date: e.endDate,
    };
  }
}
