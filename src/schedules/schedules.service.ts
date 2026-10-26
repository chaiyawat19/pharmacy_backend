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
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not defined in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }
  async extractEventsFromPdf(file: Express.Multer.File) {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 วินาที

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: 'gemini-3.6-flash',
        });

        const prompt = `คุณคือผู้เชี่ยวชาญการสกัดข้อมูลตารางกำหนดการสอบสภาเภสัชกรรมจากเอกสาร PDF
ให้ดึงข้อมูลกำหนดการทุกแถวในทุกตาราง และตอบกลับเป็น JSON Array เท่านั้น ห้ามใส่คำอธิบายเพิ่มเติม ห้ามใส่ Markdown

กฎสำคัญในการสกัดข้อมูล:

1. **การตั้งชื่อ title (สำคัญมาก):**
   - ด้านบนของแต่ละหน้าหรือตารางจะมีหัวข้อหลัก เช่น:
     "ปฏิทินการสอบความรู้ฯ ปี พ.ศ. 2569 : การสอบครั้งที่ 5/2569 [การสอบสมรรถนะเฉพาะสาขา]"
     หรือ "ปฏิทินการสอบความรู้ฯ ปี พ.ศ. 2569 : การสอบครั้งที่ 6/2569 [การสอบสมรรถนะร่วม]"
   - ให้ดึงหัวข้อหลักด้านบนรวมถึงข้อความในวงเล็บก้ามปู [...] มาใส่ใน title ของทุกรายการ แล้วต่อด้วย " - " และชื่อกิจกรรมหลักจากคอลัมน์ "การดำเนินการ"
   - ตัวอย่าง title ที่ถูกต้อง:
     - "ปฏิทินการสอบความรู้ฯ ปี พ.ศ. 2569 : การสอบครั้งที่ 5/2569 [การสอบสมรรถนะเฉพาะสาขา] - รับสมัครสอบบนเว็บไซต์ศูนย์สอบฯ"
     - "ปฏิทินการสอบความรู้ฯ ปี พ.ศ. 2569 : การสอบครั้งที่ 5/2569 [การสอบสมรรถนะเฉพาะสาขา] - วันที่สอบ PLE-IP1 , PLE-PC1 , PLE-PHCP1"
     - "ปฏิทินการสอบความรู้ฯ ปี พ.ศ. 2569 : การสอบครั้งที่ 6/2569 [การสอบสมรรถนะร่วม] - วันที่สอบ PLE-CC2"
     - "ปฏิทินการสอบความรู้ฯ ปี พ.ศ. 2569 : การสอบครั้งที่ 6/2569 [การสอบสมรรถนะร่วม] - วันที่สอบ PLE-CC1"

2. **ประเภทการสอบ type_event (ตรวจสอบเครื่องหมายถูก ✓ ในคอลัมน์ทางขวาของแต่ละแถว):**
   - คอลัมน์ที่อาจมีในตาราง:
     * คอลัมน์ "PLE-IP1, PC1,PHCP1" หรือ "PLE-IP1, PC1, PHCP1" -> ใส่ค่า "PLE-IP1, PC1, PHCP1"
     * คอลัมน์ "PLE-IP2" -> ใส่ค่า "PLE-IP2"
     * คอลัมน์ "PLE-PC2" -> ใส่ค่า "PLE-PC2"
     * คอลัมน์ "PLE-PHCP2" -> ใส่ค่า "PLE-PHCP2"
     * คอลัมน์ "PLE-CC1" -> ใส่ค่า "PLE-CC1"
     * คอลัมน์ "PLE-CC2" -> ใส่ค่า "PLE-CC2"
   - แถวใดมีเครื่องหมาย ✓ ในคอลัมน์ใด ให้นำชื่อคอลัมน์นั้นมาใส่ใน Array type_event
   - ตัวอย่าง: ถ้ามีเครื่องหมาย ✓ ที่ PLE-CC1 และ PLE-CC2 ให้ type_event เป็น ["PLE-CC1", "PLE-CC2"]

3. **วันที่ startDate และ endDate:**
   - แปลงปี พ.ศ. เป็น ค.ศ. (พ.ศ. - 543) เช่น 2569 -> 2026, 2570 -> 2027
   - แปลงเดือนภาษาไทยเป็นตัวเลข (ม.ค.=01, ก.ย.=09, ต.ค.=10, ธ.ค.=12 เป็นต้น)
   - คืนค่าในรูปแบบ "YYYY-MM-DD"
   - ถ้าเป็นวันเดียว เช่น "11 ธันวาคม 2569" -> startDate: "2026-12-11", endDate: "2026-12-11"
   - ถ้าเป็นช่วงวัน เช่น "1 - 14 กันยายน 2569" -> startDate: "2026-09-01", endDate: "2026-09-14"
   - ถ้าข้ามปี เช่น "4 - 18 มกราคม 2570" -> startDate: "2027-01-04", endDate: "2027-01-18"

4. **คำอธิบาย description:**
   - นำข้อความรายละเอียดทั้งหมดในคอลัมน์ "การดำเนินการ" ของแถวนั้นมาใส่

โครงสร้าง JSON ที่ต้องการ:
[
  {
    "title": "ปฏิทินการสอบความรู้ฯ ปี พ.ศ. 2569 : การสอบครั้งที่ 6/2569 [การสอบสมรรถนะร่วม] - วันที่สอบ PLE-CC1",
    "description": "วันที่สอบ PLE-CC1 (เวลาสอบ 14.00 - 17.00 น.)",
    "startDate": "2026-12-12",
    "endDate": "2026-12-13",
    "type_event": ["PLE-CC1"]
  }
]`;

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

        // ตรวจสอบและ Re-format ข้อมูลให้ตรงมาตรฐานระบบ
        return extractedData.map((event: any, index: number) => {
          let types: string[] = Array.isArray(event.type_event) ? event.type_event : [];

          // ปรับปรุงชื่อกลุ่มประเภทการสอบให้ตรงกับระบบ
          const normalizedTypes: string[] = [];
          for (const t of types) {
            const trimmed = String(t).trim();
            if (/PLE-IP1|PC1|PHCP1/i.test(trimmed)) {
              if (!normalizedTypes.includes("PLE-IP1, PC1, PHCP1")) {
                normalizedTypes.push("PLE-IP1, PC1, PHCP1");
              }
            } else if (/PLE-CC1/i.test(trimmed)) {
              if (!normalizedTypes.includes("PLE-CC1")) normalizedTypes.push("PLE-CC1");
            } else if (/PLE-CC2/i.test(trimmed)) {
              if (!normalizedTypes.includes("PLE-CC2")) normalizedTypes.push("PLE-CC2");
            } else if (/PLE-IP2/i.test(trimmed)) {
              if (!normalizedTypes.includes("PLE-IP2")) normalizedTypes.push("PLE-IP2");
            } else if (/PLE-PC2/i.test(trimmed)) {
              if (!normalizedTypes.includes("PLE-PC2")) normalizedTypes.push("PLE-PC2");
            } else if (/PLE-PHCP2/i.test(trimmed)) {
              if (!normalizedTypes.includes("PLE-PHCP2")) normalizedTypes.push("PLE-PHCP2");
            } else if (trimmed) {
              if (!normalizedTypes.includes(trimmed)) normalizedTypes.push(trimmed);
            }
          }
          event.type_event = normalizedTypes;

          // ✅ Validation: ถ้า title ว่าง ให้สร้างจาก description หรือวันที่
          if (!event.title || event.title.trim() === '') {
            if (event.description) {
              event.title = event.description.substring(0, 100);
            } else if (event.startDate) {
              event.title = `กิจกรรมวันที่ ${event.startDate}`;
            } else {
              event.title = `กิจกรรมที่ ${index + 1}`;
            }
          }

          return event;
        });

      } catch (error: any) {
        const isRetryable = error.status === 503 || error.status === 429 || error.code === 'ECONNRESET';

        if (isRetryable && attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.warn(`AI Extraction attempt ${attempt}/${maxRetries} failed. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // ถ้าครบ retry หรือ error ไม่สามารถ retry ได้
        console.error('AI Extraction Error:', error);
        throw new BadRequestException(
          attempt >= maxRetries
            ? 'AI API ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง'
            : 'การดึงข้อมูลผิดพลาด: ' + error.message
        );
      }
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
        `ชื่อ "${createScheduleDto.title}" ถูกใช้ไปแล้ว`
      );
    }

    // 1. ตรวจสอบวันที่ (ป้องกัน NaN/Invalid Date)
    const start = new Date(createScheduleDto.startDate);
    if (isNaN(start.getTime())) {
      throw new BadRequestException(`วันที่เริ่มต้นไม่ถูกต้อง: ${createScheduleDto.startDate}`);
    }

    const end = createScheduleDto.endDate ? new Date(createScheduleDto.endDate) : start;
    if (isNaN(end.getTime())) {
      throw new BadRequestException(`วันที่สิ้นสุดไม่ถูกต้อง: ${createScheduleDto.endDate}`);
    }
    if (end < start) {
      throw new BadRequestException('วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่มต้น');
    }

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
      link_url: createScheduleDto.link_url,
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

    // ช่วงวันที่หลังแก้ไข (ใช้ค่าเดิมกับฝั่งที่ไม่ได้ส่งมา) — วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่มต้น
    const nextStart: Date = updateData.start_time ?? existing.start_time;
    const nextEnd: Date = updateData.end_time ?? existing.end_time;
    if (nextStart && nextEnd && new Date(nextEnd) < new Date(nextStart)) {
      throw new BadRequestException('วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่มต้น');
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
