import { Test, TestingModule } from '@nestjs/testing';
import { ItemsBankService } from './items-bank.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ItemsBank } from './entities/items-bank.entity';
import { ItemSituation } from './entities/item_situations.entity';
import { Item } from './entities/items.entity';
import { ItemBankItem } from './entities/item_bank_items.entity';
import { AnswerOption } from './entities/answer_options.entity';
import { ItemSubTopic } from './entities/item_sub_topics.entity';
import { ItemBankCategory } from './entities/item_bank_category.entity';
import { ExamSession } from './entities/exam-session.entity';
import { UserItemMastery } from './entities/user_item_mastery.entity';
import { CATSession } from '../cat/entities/cat-session.entity';
import { User } from '../users/entities/user.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NameUniquenessService } from '../common/name-uniqueness.service';

function createMockRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((entity) => Promise.resolve({ item_bank_id: 1, ...entity })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      getCount: jest.fn().mockResolvedValue(0),
    }),
  };
}

describe('ItemsBankService', () => {
  let service: ItemsBankService;
  let itemsBankRepo: ReturnType<typeof createMockRepo>;

  beforeEach(async () => {
    itemsBankRepo = createMockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsBankService,
        { provide: getRepositoryToken(ItemsBank), useValue: itemsBankRepo },
        { provide: getRepositoryToken(ItemSituation), useValue: createMockRepo() },
        { provide: getRepositoryToken(Item), useValue: createMockRepo() },
        { provide: getRepositoryToken(ItemBankItem), useValue: createMockRepo() },
        { provide: getRepositoryToken(AnswerOption), useValue: createMockRepo() },
        { provide: getRepositoryToken(ItemSubTopic), useValue: createMockRepo() },
        { provide: getRepositoryToken(ItemBankCategory), useValue: createMockRepo() },
        { provide: getRepositoryToken(ExamSession), useValue: createMockRepo() },
        { provide: getRepositoryToken(UserItemMastery), useValue: createMockRepo() },
        { provide: getRepositoryToken(CATSession), useValue: createMockRepo() },
        { provide: getRepositoryToken(User), useValue: createMockRepo() },
        { provide: getRepositoryToken(Notification), useValue: createMockRepo() },
        {
          provide: NotificationsGateway,
          useValue: {
            sendNotificationToUser: jest.fn(),
            broadcastNotification: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: { save: jest.fn() },
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test') },
        },
        {
          provide: NameUniquenessService,
          useValue: { checkNameUniqueness: jest.fn().mockResolvedValue({ isUnique: true }) },
        },
      ],
    }).compile();

    service = module.get<ItemsBankService>(ItemsBankService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
