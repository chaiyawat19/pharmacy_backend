import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleGenAI } from '@google/genai';
import { Schedule } from './entities/schedule.entity';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NameUniquenessService } from '../common/name-uniqueness.service';

@Injectable()
export class SchedulesService {
  private genAI: GoogleGenerativeAI;

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly nameUniquenessService: NameUniquenessService,
  ) {
    this.genAI = new GoogleGenerativeAI(
      'AIzaSyDY193ogKLZtP9iYoUkTysUxV3-JSUIEA0',
    );
  }
  async extractEventsFromPdf(file: Express.Multer.File) {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
      });

      const prompt = `ดึงข้อมูลกำหนดการจาก PDF นี้และตอบกลับเป็น JSON Array เท่านั้น
      ห้ามอธิบายเพิ่มเติม ห้ามใส่ Markdown
      
      เงื่อนไขสำคัญสำหรับ type_event:
      - ถ้าเนื้อหาเกี่ยวข้องกับ PLE-IP1 หรือ PC1 หรือ PHCP1 ให้บันทึกค่าใน Array เป็น "PLE-IP1, PC1, PHCP1" (ก้อนเดียว)
      - หลักสูตรอื่นๆ ให้ระบุแยกตามปกติ
      
      โครงสร้าง JSON: [{ "title": "...", "description": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "type_event": ["PLE-IP1, PC1, PHCP1"] }]`;

      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            data: file.buffer.toString('base64'),
            mimeType: 'application/pdf',
          },
        },
      ]);

      const response = await result.response;
      const responseText = response.text();

      if (!responseText) throw new Error('AI ไม่สามารถดึงข้อมูลได้');

      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      const extractedData = JSON.parse(cleanJson);

      // ตรวจสอบและ Re-format ข้อมูลเผื่อ AI พลาด
      return extractedData.map((event: any) => {
        const types: string[] = event.type_event || [];
        const hasGroup1 = types.some(t => /PLE-IP1|PC1|PHCP1/.test(t));

        if (hasGroup1) {
          const others = types.filter(t => !/PLE-IP1|PC1|PHCP1/.test(t));
          event.type_event = ["PLE-IP1, PC1, PHCP1", ...others];
        }
        return event;
      });

    } catch (error: any) {
      console.error('AI Extraction Error:', error);
      throw new BadRequestException('การดึงข้อมูลผิดพลาด: ' + error.message);
    }
  }

  async create(createScheduleDto: CreateScheduleDto, userId: number) {
    if (!userId) throw new UnauthorizedException('กรุณา Login ใหม่');

    // Check name uniqueness across all entities
    const uniquenessCheck = await this.nameUniquenessService.checkNameUniqueness(
      createScheduleDto.title,
      'schedule'
    );

    if (uniquenessCheck.exists) {
      throw new BadRequestException(
        `ชื่อ "${createScheduleDto.title}" ถูกใช้ไปแล้วใน${uniquenessCheck.conflictingEntity}`
      );
    }

    // 1. ตรวจสอบวันที่ (ป้องกัน NaN/Invalid Date)
    const start = new Date(createScheduleDto.startDate);
    if (isNaN(start.getTime())) {
      throw new BadRequestException(`วันที่เริ่มต้นไม่ถูกต้อง: ${createScheduleDto.startDate}`);
    }

    const end = createScheduleDto.endDate ? new Date(createScheduleDto.endDate) : start;

    // 2. จัดการกลุ่มหลักสูตร (ถ้าส่งแยกมา ให้รวมเป็นก้อนเดียวตามกฎ)
    let typeEvent = Array.isArray(createScheduleDto.type_event)
      ? createScheduleDto.type_event
      : [];

    const hasGroup1 = typeEvent.some(t => /PLE-IP1|PC1|PHCP1/.test(t));
    if (hasGroup1) {
      const others = typeEvent.filter(t => !/PLE-IP1|PC1|PHCP1/.test(t));
      // เช็คว่ามีก้อนที่เป็นคอมม่าอยู่แล้วหรือยัง ถ้าไม่มีให้เพิ่มเข้าชุด
      if (!typeEvent.includes("PLE-IP1, PC1, PHCP1")) {
        typeEvent = ["PLE-IP1, PC1, PHCP1", ...others];
      }
    }

    const newSchedule = this.scheduleRepo.create({
      title: createScheduleDto.title,
      description: createScheduleDto.description,
      start_time: start,
      end_time: end,
      type_event: typeEvent,
      user_id: userId,
      is_public: createScheduleDto.is_public ?? true,
    });

    const savedSchedule = await this.scheduleRepo.save(newSchedule);

    // แจ้งเตือนผู้ใช้ทุกคนเมื่อมีกำหนดการใหม่ (เฉพาะตัวที่เป็น Public)
    if (savedSchedule.is_public) {
      this.notifyAllUsersNewSchedule(savedSchedule).catch(err =>
        console.error('Failed to send schedule notifications:', err)
      );
    }

    return savedSchedule;
  }

  private async notifyAllUsersNewSchedule(schedule: Schedule) {
    try {
      const users = await this.usersService.findAll();
      console.log('Users found:', users.length); 

      const results = await Promise.allSettled(
        users.map((user) =>
        this.notificationsService.create({
          user_id: user.user_id,
          title: `📅 กำหนดการใหม่: ${schedule.title}`,
            message:
              schedule.description || 'มีรายการกำหนดการใหม่เพิ่มเข้ามาในปฏิทิน',
            notification_type_id: 1,
          link_url: '/user/calendar'
        })
      ));

      // ✅ เช็คว่า notification ไหน fail
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.error(`Failed for user ${users[i].user_id}:`, result.reason);
        } else {
          console.log(`Notification saved for user ${users[i].user_id}`);
        }
      });
    } catch (error) {
      console.error('Error sending schedule notifications:', error);
    }
  }

  async updateAllStatus(userId: number, isPublic: boolean) {
    return await this.scheduleRepo.update(
      { user_id: userId },
      { is_public: isPublic },
    );
  }

  /**
   * Update: แก้ไขข้อมูล
   */
  async update(id: number, dto: UpdateScheduleDto) {
    const existing = await this.findOne(id);
    if (!existing) throw new BadRequestException('ไม่พบข้อมูลที่ต้องการแก้ไข');

    const updateData: any = { ...dto };

    // จัดการวันที่
    if (dto.startDate) {
      const d = new Date(dto.startDate);
      if (!isNaN(d.getTime())) updateData.start_time = d;
      delete updateData.startDate;
    }

    if (dto.endDate) {
      const d = new Date(dto.endDate);
      if (!isNaN(d.getTime())) updateData.end_time = d;
      delete updateData.endDate;
    }

    // จัดการกลุ่มหลักสูตรกรณีมีการแก้ไข type_event
    if (dto.type_event && Array.isArray(dto.type_event)) {
      const hasGroup1 = dto.type_event.some(t => /PLE-IP1|PC1|PHCP1/.test(t));
      if (hasGroup1) {
        const others = dto.type_event.filter(t => !/PLE-IP1|PC1|PHCP1/.test(t));
        updateData.type_event = ["PLE-IP1, PC1, PHCP1", ...others];
      }
    }

    await this.scheduleRepo.update(id, updateData);
    return this.findOne(id);
  }

  // --- Helpers ---
  async findAll() {
    return await this.scheduleRepo.find({ order: { start_time: 'ASC' } });
  }

  async findOne(id: number) {
    return await this.scheduleRepo.findOneBy({ id });
  }

  async remove(id: number) {
    await this.scheduleRepo.delete(id);
    return { deleted: true };
  }
}
