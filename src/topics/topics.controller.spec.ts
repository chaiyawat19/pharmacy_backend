import { Test, TestingModule } from '@nestjs/testing';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';

describe('TopicsController', () => {
  let controller: TopicsController;
  let service: Partial<TopicsService>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findAllSubTopics: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ topic_id: 1, topic_name: 'Topic' }),
      createSubTopic: jest.fn().mockResolvedValue({ sub_topic_id: 1, sub_topic_name: 'Sub' }),
      update: jest.fn().mockResolvedValue({ topic_id: 1 }),
      updateSubTopic: jest.fn().mockResolvedValue({ sub_topic_id: 1 }),
      remove: jest.fn().mockResolvedValue({ affected: 1 }),
      removeSubTopic: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TopicsController],
      providers: [{ provide: TopicsService, useValue: service }],
    }).compile();

    controller = module.get<TopicsController>(TopicsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call findAll', async () => {
    await controller.findAll();
    expect(service.findAll).toHaveBeenCalled();
  });
});
