import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { Schedule } from './entities/schedule.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class SchedulesService {
  private ai: GoogleGenAI;

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
  ) {
    this.ai = new GoogleGenAI({
      apiKey: 'AIzaSyCuvm1vI8Eun2vWXQb2BJmEJauQvI656Ds',
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

      // แก้ไข Error TS18048 ตรงนี้
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
    return await this.scheduleRepo.save(newSchedule);
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
