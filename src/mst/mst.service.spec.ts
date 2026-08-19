import { Test, TestingModule } from '@nestjs/testing';
import { MSTService } from './mst.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { MSTSession } from './entities/mst-session.entity';
import { ItemsBank } from '../items-bank/entities/items-bank.entity';
import { ItemBankItem } from '../items-bank/entities/item_bank_items.entity';
import { Item } from '../items-bank/entities/items.entity';
import { AnswerOption } from '../items-bank/entities/answer_options.entity';
import { ItemSubTopic } from '../items-bank/entities/item_sub_topics.entity';
import { Topic } from '../topics/entities/topic.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { IRTService } from '../cat/irt.service';
import { MSTRoutingService } from './mst-routing.service';
import { NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';

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
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([]),
            getOne: jest.fn().mockResolvedValue(null),
        }),
    };
}

describe('MSTService', () => {
    let service: MSTService;
    let sessionRepo: ReturnType<typeof createMockRepo>;
    let mstSessionRepo: ReturnType<typeof createMockRepo>;
    let itemsBankRepo: ReturnType<typeof createMockRepo>;
    let itemBankItemRepo: ReturnType<typeof createMockRepo>;
    let itemRepo: ReturnType<typeof createMockRepo>;
    let answerOptionRepo: ReturnType<typeof createMockRepo>;
    let itemSubTopicRepo: ReturnType<typeof createMockRepo>;
    let topicRepo: ReturnType<typeof createMockRepo>;
    let notificationsService: Partial<NotificationsService>;
    let irtService: IRTService;
    let routingService: MSTRoutingService;

    beforeEach(async () => {
        sessionRepo = createMockRepo();
        mstSessionRepo = createMockRepo();
        itemsBankRepo = createMockRepo();
        itemBankItemRepo = createMockRepo();
        itemRepo = createMockRepo();
        answerOptionRepo = createMockRepo();
        itemSubTopicRepo = createMockRepo();
        topicRepo = createMockRepo();
        notificationsService = {
            create: jest.fn().mockResolvedValue(null),
            createAndBroadcast: jest.fn().mockResolvedValue(null),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MSTService,
                IRTService,
                MSTRoutingService,
                { provide: getRepositoryToken(ExamSession), useValue: sessionRepo },
                { provide: getRepositoryToken(MSTSession), useValue: mstSessionRepo },
                { provide: getRepositoryToken(ItemsBank), useValue: itemsBankRepo },
                { provide: getRepositoryToken(ItemBankItem), useValue: itemBankItemRepo },
                { provide: getRepositoryToken(Item), useValue: itemRepo },
                { provide: getRepositoryToken(AnswerOption), useValue: answerOptionRepo },
                { provide: getRepositoryToken(ItemSubTopic), useValue: itemSubTopicRepo },
                { provide: getRepositoryToken(Topic), useValue: topicRepo },
                { provide: NotificationsService, useValue: notificationsService },
            ],
        }).compile();

        service = module.get<MSTService>(MSTService);
        irtService = module.get<IRTService>(IRTService);
        routingService = module.get<MSTRoutingService>(MSTRoutingService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('startMSTExam', () => {
        it('should throw NotFoundException if item bank does not exist', async () => {
            itemsBankRepo.findOne.mockResolvedValue(null);

            await expect(
                service.startMSTExam(1, { item_bank_id: 999, total_stages: 2, items_per_stage: 10 }),
            ).rejects.toThrow(NotFoundException);
        });

        it('should start exam session successfully with Stage 1 medium items', async () => {
            itemsBankRepo.findOne.mockResolvedValue({ item_bank_id: 1, bank_name: 'Test Bank' });

            const mockExamSession = {
                session_id: 100,
                userId: 1,
                session_type: 'MST',
                start_time: new Date(),
            };
            sessionRepo.create.mockReturnValue(mockExamSession);
            sessionRepo.save.mockResolvedValue(mockExamSession);

            const mockItems: Item[] = [
                {
                    item_id: 1,
                    question_text: 'Q1',
                    irt_a_discrimination: 1.0,
                    irt_b_difficulty: 0.0,
                    irt_c_guessing: 0.2,
                } as Item,
            ];

            const qb = itemRepo.createQueryBuilder();
            qb.getMany.mockResolvedValue(mockItems);

            itemRepo.find.mockResolvedValue(mockItems);
            answerOptionRepo.find.mockResolvedValue([
                { option_id: 10, item_id: 1, option_text: 'Opt A', is_correct: true },
            ]);
            itemSubTopicRepo.find.mockResolvedValue([]);

            const mockMSTSession = {
                session_id: 100,
                current_stage: 1,
                total_stages: 2,
                items_per_stage: 1,
                routing_path: ['Stage 1 (Medium)'],
                stage_items: { '1': [1] },
                used_item_ids: [1],
                current_theta: 0.0,
                current_se: 0.8,
            };
            mstSessionRepo.create.mockReturnValue(mockMSTSession);
            mstSessionRepo.save.mockResolvedValue(mockMSTSession);

            const result = await service.startMSTExam(1, {
                item_bank_id: 1,
                total_stages: 2,
                items_per_stage: 1,
            });

            expect(result).toHaveProperty('session_id', 100);
            expect(result.current_stage).toBe(1);
            expect(result.stage_items).toHaveLength(1);
        });
    });

    describe('submitStage', () => {
        it('should throw UnauthorizedException if user does not own session', async () => {
            mstSessionRepo.findOne.mockResolvedValue({
                session_id: 100,
                base_session: { userId: 999, end_time: null },
            });

            await expect(
                service.submitStage(1, {
                    session_id: 100,
                    stage_number: 1,
                    answers: [],
                }),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw BadRequestException if exam is already completed', async () => {
            mstSessionRepo.findOne.mockResolvedValue({
                session_id: 100,
                base_session: { userId: 1, end_time: new Date() },
            });

            await expect(
                service.submitStage(1, {
                    session_id: 100,
                    stage_number: 1,
                    answers: [],
                }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('Admin Analytics & Readiness', () => {
        it('should calculate admin analytics correctly', async () => {
            mstSessionRepo.find.mockResolvedValue([
                {
                    session_id: 1,
                    final_theta: 1.2,
                    final_se: 0.25,
                    total_items_answered: 20,
                    total_correct: 18,
                    passed: true,
                    routing_path: ['Stage 1 (Medium)', 'Stage 2 (Hard)'],
                    base_session: {
                        userId: 1,
                        end_time: new Date(),
                        user: { first_name: 'John', last_name: 'Doe' },
                    },
                },
            ]);

            const analytics = await service.getAdminAnalytics();
            expect(analytics.total_sessions).toBe(1);
            expect(analytics.passed).toBe(1);
            expect(analytics.pass_rate).toBe(100);
            expect(analytics.avg_theta).toBe(1.2);
            expect(analytics.pathway_distribution).toHaveProperty('Stage 1 (Medium) ➔ Stage 2 (Hard)', 1);
        });

        it('should evaluate item bank readiness', async () => {
            const qb = itemRepo.createQueryBuilder();
            qb.getMany.mockResolvedValue([
                // 10 easy
                ...Array.from({ length: 10 }, (_, i) => ({
                    item_id: i + 1,
                    irt_a_discrimination: 1.0,
                    irt_b_difficulty: -0.8,
                    irt_c_guessing: 0.2,
                })),
                // 10 medium
                ...Array.from({ length: 10 }, (_, i) => ({
                    item_id: i + 11,
                    irt_a_discrimination: 1.0,
                    irt_b_difficulty: 0.0,
                    irt_c_guessing: 0.2,
                })),
                // 10 hard
                ...Array.from({ length: 10 }, (_, i) => ({
                    item_id: i + 21,
                    irt_a_discrimination: 1.0,
                    irt_b_difficulty: 1.0,
                    irt_c_guessing: 0.2,
                })),
            ]);

            const readiness = await service.checkMSTReadiness();
            expect(readiness.total_items).toBe(30);
            expect(readiness.is_ready).toBe(true);
            expect(readiness.difficulty_breakdown.easy).toBe(10);
            expect(readiness.difficulty_breakdown.medium).toBe(10);
            expect(readiness.difficulty_breakdown.hard).toBe(10);
        });
    });
});
