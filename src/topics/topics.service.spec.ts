import { Test, TestingModule } from '@nestjs/testing';
import { TopicsService } from './topics.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Topic } from './entities/topic.entity';
import { SubTopic } from './entities/sub-topics.entity';
import { ItemSubTopic } from '../items-bank/entities/item_sub_topics.entity';
import { NameUniquenessService } from '../common/name-uniqueness.service';

describe('TopicsService', () => {
  let service: TopicsService;
  let topicRepo: any;
  let subTopicRepo: any;
  let itemSubTopicRepo: any;
  let nameUniquenessService: any;

  beforeEach(async () => {
    topicRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((t) => Promise.resolve({ topic_id: 1, ...t })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    subTopicRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((st) => Promise.resolve({ sub_topic_id: 1, ...st })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    itemSubTopicRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    nameUniquenessService = {
      checkNameUniqueness: jest.fn().mockResolvedValue({ isUnique: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicsService,
        { provide: getRepositoryToken(Topic), useValue: topicRepo },
        { provide: getRepositoryToken(SubTopic), useValue: subTopicRepo },
        { provide: getRepositoryToken(ItemSubTopic), useValue: itemSubTopicRepo },
        { provide: NameUniquenessService, useValue: nameUniquenessService },
      ],
    }).compile();

    service = module.get<TopicsService>(TopicsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should find all topics with subtopics', async () => {
    const mockTopics = [{ topic_id: 1, topic_name: 'Pharmacology' }];
    topicRepo.find.mockResolvedValue(mockTopics);
    subTopicRepo.find.mockResolvedValue([]);

    const result = await service.findAll();
    expect(result).toEqual([{ topic_id: 1, topic_name: 'Pharmacology', sub_topics: [] }]);
    expect(topicRepo.find).toHaveBeenCalled();
  });
});
