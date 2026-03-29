import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleGenAI } from '@google/genai';
import { Schedule } from './entities/schedule.entity';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class SchedulesService {
  private ai: GoogleGenAI;

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  async extractEventsFromPdf(file: Express.Multer.File) {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: "ดึงข้อมูลกำหนดการจาก PDF นี้เป็น JSON Array: [{'title': '...', 'description': '...', 'startDate': 'YYYY-MM-DD', 'endDate': 'YYYY-MM-DD'}] ตอบเฉพาะ JSON เท่านั้น",
              },
              {
                inlineData: {
                  data: file.buffer.toString('base64'),
                  mimeType: 'application/pdf',
                },
              },
            ],
          },
        ],
      });

      const responseText = response.text || '';

      if (!responseText) {
        throw new Error('AI ไม่สามารถดึงข้อมูลจากไฟล์นี้ได้');
      }

      const text = responseText.replace(/```json|```/g, '').trim();
      return JSON.parse(text);
    } catch (error: any) {
      throw new Error('เกิดข้อผิดพลาด: ' + error.message);
    }
  }

  async create(createScheduleDto: CreateScheduleDto, userId: number) {
    if (!userId) {
      throw new UnauthorizedException('ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่');
    }
    const newSchedule = this.scheduleRepo.create({
      ...createScheduleDto,
      user_id: userId
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
        // กำหนดการใช้ type_id = 1
        await Promise.all(users.map(user => 
            this.notificationsService.create({
                user_id: user.user_id,
                title: `📅 กำหนดการใหม่: ${schedule.title}`,
                message: schedule.description || 'มีรายการกำหนดการใหม่เพิ่มเข้ามาในปฏิทิน',
                notification_type_id: 1, 
                link_url: '/user/calendar'
            })
        ));
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

  async removeAll(userId: number) {
    if (!userId) {
      throw new UnauthorizedException('ไม่พบข้อมูลผู้ใช้งาน');
    }
    return await this.scheduleRepo.delete({ user_id: userId });
  }
}
