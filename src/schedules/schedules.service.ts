import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { Schedule } from './entities/schedule.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class SchedulesService {
  private genAI: GoogleGenerativeAI;

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
  ) {
    // แนะนำ: ใช้ ConfigService ดึง API Key จาก .env
    this.genAI = new GoogleGenerativeAI('AIzaSyCuvm1vI8Eun2vWXQb2BJmEJauQvI656Ds');
  }

  /**
   * AI Extraction: ดึงข้อมูลจาก PDF และจัดกลุ่มหลักสูตร
   */
  async extractEventsFromPdf(file: Express.Multer.File) {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
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

  /**
   * Create: บันทึกลง Database พร้อมตรวจสอบวันที่
   */
  async create(createScheduleDto: CreateScheduleDto, userId: number) {
    if (!userId) throw new UnauthorizedException('กรุณา Login ใหม่');

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

    return await this.scheduleRepo.save(newSchedule);
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

  async updateAllStatus(userId: number, isPublic: boolean) {
    return await this.scheduleRepo.update({ user_id: userId }, { is_public: isPublic });
  }
}