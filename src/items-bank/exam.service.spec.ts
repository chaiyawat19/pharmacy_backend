import { Test, TestingModule } from '@nestjs/testing';
import { ExamService } from './exam.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExamSession } from './entities/exam-session.entity';
import { Item } from './entities/items.entity';
import { ItemBankItem } from './entities/item_bank_items.entity';
import { ItemBankCategory } from './entities/item_bank_category.entity';
import { UserItemMastery } from './entities/user_item_mastery.entity';
import { ItemSubTopic } from './entities/item_sub_topics.entity';
import { ItemsBank } from './entities/items-bank.entity';
import { CATSession } from '../cat/entities/cat-session.entity';
import {
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

/** สร้าง mock Repository */
function createMockRepo() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndMapOne: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
    }),
  };
}

/** สร้าง ExamSession จำลอง */
function makeSession(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    session_id: 1 as any,
    userId: 42,
    itemBankId: 10,
    session_type: 'NORMAL',
    start_time: new Date(),
    end_time: null,
    final_score: 0,
    responses: [],
    item_bank: null,
    user: null,
    ...overrides,
  } as ExamSession;
}

/** สร้าง Item จำลอง */
function makeItem(id: number, correctOptionId: number) {
  return {
    item_id: id,
    question_text: `Question ${id}`,
    explanation: 'Explanation',
    answer_options: [
      { option_id: correctOptionId, option_text: 'A', is_correct: true },
      { option_id: correctOptionId + 10, option_text: 'B', is_correct: false },
    ],
    situation: null,
  };
}

describe('ExamService', () => {
  let service: ExamService;
  let sessionRepo: ReturnType<typeof createMockRepo>;
  let itemRepo: ReturnType<typeof createMockRepo>;
  let bankRepo: ReturnType<typeof createMockRepo>;
  let masteryRepo: ReturnType<typeof createMockRepo>;
  let itemBankItemRepo: ReturnType<typeof createMockRepo>;
  let itemBankCategoryRepo: ReturnType<typeof createMockRepo>;
  let itemSubTopicRepo: ReturnType<typeof createMockRepo>;
  let catSessionRepo: ReturnType<typeof createMockRepo>;

  beforeEach(async () => {
    sessionRepo = createMockRepo();
    itemRepo = createMockRepo();
    bankRepo = createMockRepo();
    masteryRepo = createMockRepo();
    itemBankItemRepo = createMockRepo();
    itemBankCategoryRepo = createMockRepo();
    itemSubTopicRepo = createMockRepo();
    catSessionRepo = createMockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamService,
        { provide: getRepositoryToken(ExamSession), useValue: sessionRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(ItemBankItem), useValue: itemBankItemRepo },
        { provide: getRepositoryToken(ItemBankCategory), useValue: itemBankCategoryRepo },
        { provide: getRepositoryToken(UserItemMastery), useValue: masteryRepo },
        { provide: getRepositoryToken(ItemSubTopic), useValue: itemSubTopicRepo },
        { provide: getRepositoryToken(ItemsBank), useValue: bankRepo },
        { provide: getRepositoryToken(CATSession), useValue: catSessionRepo },
      ],
    }).compile();

    service = module.get<ExamService>(ExamService);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================
  // startExam
  // ============================================================
  describe('startExam()', () => {
    it('ควร throw NotFoundException ถ้าไม่พบ item bank', async () => {
      bankRepo.findOne.mockResolvedValue(null);

      await expect(service.startExam(1, { item_bank_id: 99 }))
        .rejects.toThrow(NotFoundException);
    });

    it('ควร สร้าง session ใหม่และ return session_id', async () => {
      bankRepo.findOne.mockResolvedValue({ item_bank_id: 10, bank_name: 'ชุดทดสอบ' });
      const newSession = makeSession({ session_id: 5 as any });
      sessionRepo.create.mockReturnValue(newSession);
      sessionRepo.save.mockResolvedValue(newSession);

      const result = await service.startExam(42, { item_bank_id: 10 });

      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42, itemBankId: 10, session_type: 'NORMAL' }),
      );
      expect(result).toHaveProperty('session_id');
      expect(result).toHaveProperty('item_bank_id', 10);
    });
  });

  // ============================================================
  // cancelExam
  // ============================================================
  describe('cancelExam()', () => {
    it('ควร return cancelled: false ถ้าไม่พบ session', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      const result = await service.cancelExam(42, 999);
      expect(result.cancelled).toBe(false);
    });

    it('ควร throw UnauthorizedException ถ้า session เป็นของ user อื่น', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ userId: 99 })); // user อื่น

      await expect(service.cancelExam(42, 1)).rejects.toThrow(UnauthorizedException);
    });

    it('ควร return cancelled: false ถ้า session จบไปแล้ว', async () => {
      sessionRepo.findOne.mockResolvedValue(
        makeSession({ userId: 42, end_time: new Date() }),
      );

      const result = await service.cancelExam(42, 1);
      expect(result.cancelled).toBe(false);
    });

    it('ควร ลบ session และ return cancelled: true', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ userId: 42 }));
      sessionRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.cancelExam(42, 1);

      expect(sessionRepo.delete).toHaveBeenCalledWith({ session_id: 1 });
      expect(result.cancelled).toBe(true);
    });
  });

  // ============================================================
  // submitExam
  // ============================================================
  describe('submitExam()', () => {
    it('ควร throw NotFoundException ถ้าไม่พบ session', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(service.submitExam(42, 1, { answers: [] }))
        .rejects.toThrow(NotFoundException);
    });

    it('ควร throw UnauthorizedException ถ้า session เป็นของ user อื่น', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ userId: 99 }));

      await expect(service.submitExam(42, 1, { answers: [] }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('ควร throw BadRequestException ถ้า session ถูก submit ไปแล้ว', async () => {
      sessionRepo.findOne.mockResolvedValue(
        makeSession({ userId: 42, end_time: new Date() }),
      );

      await expect(service.submitExam(42, 1, { answers: [] }))
        .rejects.toThrow(BadRequestException);
    });

    it('ควร คำนวณ score ถูกต้องสำหรับคำตอบที่ถูก', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ userId: 42 }));
      itemRepo.find.mockResolvedValue([makeItem(101, 201), makeItem(102, 202)]);
      masteryRepo.findOne.mockResolvedValue(null);
      masteryRepo.create.mockReturnValue({});
      masteryRepo.save.mockResolvedValue({});
      sessionRepo.update.mockResolvedValue({ affected: 1 });

      const answers = [
        { item_id: 101, selected_option_id: 201, response_time_ms: 3000 }, // ถูก
        { item_id: 102, selected_option_id: 999, response_time_ms: 2000 }, // ผิด
      ];

      const result = await service.submitExam(42, 1, { answers });

      expect(result.total_questions).toBe(2);
      expect(result.correct_count).toBe(1);
      expect(result.final_score).toBe(50); // 1/2 * 100
    });

    it('ควร return score 100% ถ้าตอบถูกทุกข้อ', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ userId: 42 }));
      itemRepo.find.mockResolvedValue([makeItem(101, 201)]);
      masteryRepo.findOne.mockResolvedValue(null);
      masteryRepo.create.mockReturnValue({});
      masteryRepo.save.mockResolvedValue({});
      sessionRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.submitExam(42, 1, {
        answers: [{ item_id: 101, selected_option_id: 201, response_time_ms: 1000 }],
      });

      expect(result.final_score).toBe(100);
      expect(result.correct_count).toBe(1);
    });

    it('ควร return score 0% ถ้าไม่มีคำตอบ', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ userId: 42 }));
      itemRepo.find.mockResolvedValue([]);
      sessionRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.submitExam(42, 1, { answers: [] });

      expect(result.final_score).toBe(0);
      expect(result.total_questions).toBe(0);
    });
  });

  // ============================================================
  // getExamResult
  // ============================================================
  describe('getExamResult()', () => {
    it('ควร throw NotFoundException ถ้าไม่พบ session', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(service.getExamResult(42, 999)).rejects.toThrow(NotFoundException);
    });

    it('ควร throw UnauthorizedException ถ้า session เป็นของ user อื่น', async () => {
      sessionRepo.findOne.mockResolvedValue(makeSession({ userId: 99 }));

      await expect(service.getExamResult(42, 1)).rejects.toThrow(UnauthorizedException);
    });

    it('ควร return ผลสอบพร้อม responses', async () => {
      const completedSession = makeSession({
        userId: 42,
        end_time: new Date(),
        final_score: 75,
        responses: [{ item_id: 101, is_correct: true, selected_option_id: 201 }],
      });
      sessionRepo.findOne.mockResolvedValue(completedSession);
      itemRepo.find.mockResolvedValue([makeItem(101, 201)]);
      itemSubTopicRepo.find.mockResolvedValue([]);

      const result = await service.getExamResult(42, 1);

      expect(result).toHaveProperty('session_id', 1);
      expect(result).toHaveProperty('final_score', 75);
      expect(result).toHaveProperty('status', 'COMPLETED');
      expect(result.responses).toHaveLength(1);
    });
  });

  // ============================================================
  // updateUserItemMastery
  // ============================================================
  describe('updateUserItemMastery()', () => {
    it('ควร สร้าง mastery ใหม่ถ้ายังไม่มีประวัติ', async () => {
      masteryRepo.findOne.mockResolvedValue(null);
      masteryRepo.create.mockReturnValue({
        user_id: 1, item_id: 101,
        total_attempts: 1, total_correct: 1, total_incorrect: 0, correct_streak: 1,
      });
      masteryRepo.save.mockResolvedValue({});

      await service.updateUserItemMastery(1, 101, true);

      expect(masteryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ total_correct: 1, total_incorrect: 0, correct_streak: 1 }),
      );
    });

    it('ควร อัปเดต mastery ที่มีอยู่แล้ว', async () => {
      const existingMastery = {
        user_id: 1,
        item_id: 101,
        total_attempts: 3,
        total_correct: 2,
        total_incorrect: 1,
        correct_streak: 1,
        last_answered_at: new Date(),
      };
      masteryRepo.findOne.mockResolvedValue(existingMastery);
      masteryRepo.save.mockResolvedValue(existingMastery);

      await service.updateUserItemMastery(1, 101, false); // ตอบผิด

      expect(existingMastery.total_attempts).toBe(4);
      expect(existingMastery.total_incorrect).toBe(2);
      expect(existingMastery.correct_streak).toBe(0); // streak reset
    });

    it('ควร เพิ่ม correct_streak เมื่อตอบถูกต่อเนื่อง', async () => {
      const existingMastery = {
        user_id: 1, item_id: 101,
        total_attempts: 2, total_correct: 2, total_incorrect: 0, correct_streak: 2,
        last_answered_at: new Date(),
      };
      masteryRepo.findOne.mockResolvedValue(existingMastery);
      masteryRepo.save.mockResolvedValue(existingMastery);

      await service.updateUserItemMastery(1, 101, true);

      expect(existingMastery.correct_streak).toBe(3);
    });
  });
});
