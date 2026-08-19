import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Topic } from '../topics/entities/topic.entity';
import { SubTopic } from '../topics/entities/sub-topics.entity';
import { ItemsBank } from '../items-bank/entities/items-bank.entity';
import { NewsArticle } from '../news/entities/news.entity';
import { Schedule } from '../schedules/entities/schedule.entity';

@Injectable()
export class NameUniquenessService {
  constructor(
    @InjectRepository(Topic)
    private readonly topicRepository: Repository<Topic>,
    @InjectRepository(SubTopic)
    private readonly subTopicRepository: Repository<SubTopic>,
    @InjectRepository(ItemsBank)
    private readonly itemsBankRepository: Repository<ItemsBank>,
    @InjectRepository(NewsArticle)
    private readonly newsRepository: Repository<NewsArticle>,
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
  ) {}

  /**
   * Check if a name already exists across all entities
   * @param name - The name to check
   * @param entityType - The entity type being created/updated
   * @param entityId - Optional ID to exclude from the check (for updates)
   * @returns Object with exists flag and details of where the name was found
   */
  async checkNameUniqueness(
    name: string,
    entityType: 'topic' | 'subtopic' | 'itembank' | 'news' | 'schedule',
    entityId?: number,
  ): Promise<{ exists: boolean; conflictingEntity?: string; conflictingName?: string }> {
    const trimmedName = name.trim();
    
    // Check across all entity types
    const checks = await Promise.all([
      this.checkTopicName(trimmedName, entityType === 'topic' ? entityId : undefined),
      this.checkSubTopicName(trimmedName, entityType === 'subtopic' ? entityId : undefined),
      this.checkItemBankName(trimmedName, entityType === 'itembank' ? entityId : undefined),
      this.checkNewsTitle(trimmedName, entityType === 'news' ? entityId : undefined),
      this.checkScheduleTitle(trimmedName, entityType === 'schedule' ? entityId : undefined),
    ]);

    // Find first conflict
    for (const check of checks) {
      if (check.exists) {
        return {
          exists: true,
          conflictingEntity: check.entityType,
          conflictingName: check.name,
        };
      }
    }

    return { exists: false };
  }

  private async checkTopicName(name: string, excludeId?: number) {
    const where: any = { topic_name: ILike(name) };
    if (excludeId) {
      where.topic_id = { NOT: excludeId };
    }
    
    const topic = await this.topicRepository.findOne({ where });
    return {
      exists: !!topic,
      entityType: 'Topic',
      name: topic?.topic_name,
    };
  }

  private async checkSubTopicName(name: string, excludeId?: number) {
    const where: any = { sub_topic_name: ILike(name) };
    if (excludeId) {
      where.sub_topic_id = { NOT: excludeId };
    }
    
    const subTopic = await this.subTopicRepository.findOne({ where });
    return {
      exists: !!subTopic,
      entityType: 'SubTopic',
      name: subTopic?.sub_topic_name,
    };
  }

  private async checkItemBankName(name: string, excludeId?: number) {
    const where: any = { bank_name: ILike(name) };
    if (excludeId) {
      where.item_bank_id = { NOT: excludeId };
    }
    
    const itemBank = await this.itemsBankRepository.findOne({ where });
    return {
      exists: !!itemBank,
      entityType: 'ItemBank',
      name: itemBank?.bank_name,
    };
  }

  private async checkNewsTitle(name: string, excludeId?: number) {
    const where: any = { title: ILike(name) };
    if (excludeId) {
      where.article_id = { NOT: excludeId };
    }
    
    const news = await this.newsRepository.findOne({ where });
    return {
      exists: !!news,
      entityType: 'News',
      name: news?.title,
    };
  }

  private async checkScheduleTitle(name: string, excludeId?: number) {
    const where: any = { title: ILike(name) };
    if (excludeId) {
      where.id = { NOT: excludeId };
    }
    
    const schedule = await this.scheduleRepository.findOne({ where });
    return {
      exists: !!schedule,
      entityType: 'Schedule',
      name: schedule?.title,
    };
  }
}
