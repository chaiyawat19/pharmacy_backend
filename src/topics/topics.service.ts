import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateTopicDto, CreateSubTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { Topic } from './entities/topic.entity';
import { SubTopic } from './entities/sub-topics.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemSubTopic } from '../items-bank/entities/item_sub_topics.entity';
import { NameUniquenessService } from '../common/name-uniqueness.service';

@Injectable()
export class TopicsService {
  constructor(
    @InjectRepository(Topic)
    private readonly topicRepository: Repository<Topic>,
    @InjectRepository(SubTopic)
    private readonly subTopicRepository: Repository<SubTopic>,
    @InjectRepository(ItemSubTopic)
    private readonly itemSubTopicRepo: Repository<ItemSubTopic>,
    private readonly nameUniquenessService: NameUniquenessService,
  ) { }

  async create(createTopicDto: CreateTopicDto) {
    // Check name uniqueness across all entities
    const uniquenessCheck = await this.nameUniquenessService.checkNameUniqueness(
      createTopicDto.topic_name,
      'topic'
    );

    if (uniquenessCheck.exists) {
      throw new BadRequestException(
        `ชื่อ "${createTopicDto.topic_name}" ถูกใช้ไปแล้วใน${uniquenessCheck.conflictingEntity}`
      );
    }

    const topic = this.topicRepository.create(createTopicDto);
    return this.topicRepository.save(topic);
  }

  async createSubTopic(createSubTopicDto: CreateSubTopicDto) {
    // Check name uniqueness across all entities
    const uniquenessCheck = await this.nameUniquenessService.checkNameUniqueness(
      createSubTopicDto.sub_topic_name,
      'subtopic'
    );

    if (uniquenessCheck.exists) {
      throw new BadRequestException(
        `ชื่อ "${createSubTopicDto.sub_topic_name}" ถูกใช้ไปแล้วใน${uniquenessCheck.conflictingEntity}`
      );
    }

    const subTopic = this.subTopicRepository.create(createSubTopicDto);
    return this.subTopicRepository.save(subTopic);
  }

  // ดึง topics ทั้งหมดพร้อม sub-topics
  async findAll() {
    const topics = await this.topicRepository.find({
      order: { topic_id: 'ASC' }
    });

    // ดึง sub-topics สำหรับแต่ละ topic
    const topicsWithSubTopics = await Promise.all(
      topics.map(async (topic) => {
        const subTopics = await this.subTopicRepository.find({
          where: { topic_id: topic.topic_id },
          order: { sub_topic_id: 'ASC' }
        });
        return {
          ...topic,
          sub_topics: subTopics
        };
      })
    );

    return topicsWithSubTopics;
  }

  findOne(id: number) {
    return this.topicRepository.findOne({ where: { topic_id: id } });
  }

  async findOneWithSubTopics(id: number) {
    const topic = await this.topicRepository.findOne({ where: { topic_id: id } });
    if (!topic) {
      return null;
    }
    const subTopics = await this.subTopicRepository.find({
      where: { topic_id: id },
      order: { sub_topic_id: 'ASC' }
    });
    return {
      ...topic,
      sub_topics: subTopics
    };
  }

  update(id: number, updateTopicDto: UpdateTopicDto) {
    return this.topicRepository.update(id, updateTopicDto);
  }

  async remove(id: number) {
    // ลบ sub-topics ที่เกี่ยวข้องก่อน
    await this.subTopicRepository.delete({ topic_id: id });
    // แล้วค่อยลบ topic
    return this.topicRepository.delete(id);
  }

  // Sub-topic methods
  async findAllSubTopics() {
    const [topics, subTopics] = await Promise.all([
      this.topicRepository.find({
        order: { topic_id: 'ASC' }
      }),
      this.subTopicRepository.find({
        order: { sub_topic_id: 'ASC' }
      })
    ]);

    return {
      topics: topics.map(t => ({
        topic_id: t.topic_id,
        topic_name: t.topic_name
      })),
      sub_topics: subTopics.map(st => ({
        sub_topic_id: st.sub_topic_id,
        topic_id: st.topic_id,
        sub_topic_name: st.sub_topic_name
      }))
    };
  }

  findSubTopicsByTopicId(topicId: number) {
    return this.subTopicRepository.find({
      where: { topic_id: topicId },
      order: { sub_topic_id: 'ASC' }
    });
  }

  findOneSubTopic(id: number) {
    return this.subTopicRepository.findOne({ where: { sub_topic_id: id } });
  }

  updateSubTopic(id: number, updateData: Partial<CreateSubTopicDto>) {
    return this.subTopicRepository.update(id, updateData);
  }

  removeSubTopic(id: number) {
    return this.subTopicRepository.delete(id);
  }

  /**
   * Returns item counts aggregated by topic and sub-topic (for pie charts)
   */
  async getTopicStats() {
    const allTopics = await this.topicRepository.find({ order: { topic_id: 'ASC' } });
    const allSubTopics = await this.subTopicRepository.find({ order: { sub_topic_id: 'ASC' } });
    const allLinks = await this.itemSubTopicRepo.find({ relations: ['sub_topic'] });

    // Count items per sub-topic
    const subTopicCountMap = new Map<number, number>();
    allLinks.forEach(link => {
      const id = link.sub_topic_id;
      subTopicCountMap.set(id, (subTopicCountMap.get(id) ?? 0) + 1);
    });

    // Aggregate per topic
    const subTopicsWithCount = allSubTopics.map(st => ({
      ...st,
      item_count: subTopicCountMap.get(st.sub_topic_id) ?? 0,
    }));

    const topicsWithCount = allTopics.map(t => {
      const mySubTopics = subTopicsWithCount.filter(st => st.topic_id === t.topic_id);
      const topicItemCount = mySubTopics.reduce((sum, st) => sum + st.item_count, 0);
      return {
        ...t,
        item_count: topicItemCount,
        sub_topics: mySubTopics,
      };
    });

    return {
      total_items: allLinks.length,
      by_topic: topicsWithCount,
    };
  }
}
