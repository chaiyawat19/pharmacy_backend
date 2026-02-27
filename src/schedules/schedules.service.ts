import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { Schedule } from './entities/schedule.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
// ใช้ SDK มาตรฐานที่รองรับ Gemini 3
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class SchedulesService {
  private genAI: GoogleGenerativeAI;

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
  ) {
    // แนะนำให้ใช้ ConfigService ดึงจาก .env แทนการ hardcode นะครับ
    this.genAI = new GoogleGenerativeAI('AIzaSyCuvm1vI8Eun2vWXQb2BJmEJauQvI656Ds');
  }

  async extractEventsFromPdf(file: Express.Multer.File) {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
      });

      const prompt = `ดึงข้อมูลกำหนดการจาก PDF นี้และตอบกลับเป็น JSON Array เท่านั้น
        ห้ามอธิบายเพิ่มเติม ห้ามใส่ Markdown
        โครงสร้าง: [{ "title": "...", "description": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "type_event": ["PLE-IP1"] }]`;

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
      const responseText = response.text(); // ดึง text ออกมา

      if (!responseText) {
        throw new Error('AI ไม่สามารถดึงข้อมูลจากไฟล์นี้ได้');
      }

      // ทำความสะอาด JSON (เผื่อ AI ใส่ Markdown มา)
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanJson);

    } catch (error: any) {
      console.error('AI Extraction Error:', error);
      throw new Error('การดึงข้อมูลผิดพลาด: ' + error.message);
    }
  }

  async create(createScheduleDto: CreateScheduleDto, userId: number) {
    if (!userId) {
      throw new UnauthorizedException('ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่');
    }

    // จัดการข้อมูล type_event ให้เป็น Array เสมอก่อนบันทึก
    let typeEvent = createScheduleDto.type_event;
    if (typeof typeEvent === 'string') {
      typeEvent = (typeEvent as string).split(',').map(t => t.trim()).filter(t => t);
    }

    const newSchedule = this.scheduleRepo.create({
      title: createScheduleDto.title,
      description: createScheduleDto.description,
      start_time: new Date(createScheduleDto.startDate),
      end_time: createScheduleDto.endDate ? new Date(createScheduleDto.endDate) : null,
      type_event: typeEvent || [], // รองรับ string[] ใน DB
      user_id: userId,
      is_public: createScheduleDto.is_public ?? true,
    } as any);

    return await this.scheduleRepo.save(newSchedule);
  }

  // --- ระบบจัดการข้อมูลทั่วไป ---

  async findAll() {
    return await this.scheduleRepo.find({ order: { start_time: 'ASC' } });
  }

  async findOne(id: number) {
    return await this.scheduleRepo.findOneBy({ id });
  }

  async update(id: number, dto: UpdateScheduleDto) {
    const updateData: any = { ...dto };

    // แปลงวันที่กลับเป็น format ของ Entity
    if (dto.startDate) updateData.start_time = new Date(dto.startDate);
    if (dto.endDate) updateData.end_time = new Date(dto.endDate);
    
    delete updateData.startDate;
    delete updateData.endDate;

    await this.scheduleRepo.update(id, updateData);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.scheduleRepo.delete(id);
    return { deleted: true };
  }

  async removeAll(userId: number) {
    if (!userId) throw new UnauthorizedException('ไม่พบข้อมูลผู้ใช้งาน');
    return await this.scheduleRepo.delete({ user_id: userId });
  }

  async updateAllStatus(userId: number, isPublic: boolean) {
    return await this.scheduleRepo.update(
      { user_id: userId },
      { is_public: isPublic },
    );
  }
}
