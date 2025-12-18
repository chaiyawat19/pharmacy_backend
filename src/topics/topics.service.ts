import { Injectable } from '@nestjs/common';
import { CreateTopicDto, CreateSubTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { Topic } from './entities/topic.entity';
import { SubTopic } from './entities/sub-topics.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class TopicsService {
  constructor(
    @InjectRepository(Topic)
    private readonly topicRepository: Repository<Topic>,
    @InjectRepository(SubTopic)
    private readonly subTopicRepository: Repository<SubTopic>,
  ) { }

  create(createTopicDto: CreateTopicDto) {
    const topic = this.topicRepository.create(createTopicDto);
    return this.topicRepository.save(topic);
  }

  createSubTopic(createSubTopicDto: CreateSubTopicDto) {
    const subTopic = this.subTopicRepository.create(createSubTopicDto);
    return this.subTopicRepository.save(subTopic);
  }

  findAll() {
    return this.topicRepository.find();
  }

  findOne(id: number) {
    return this.topicRepository.findOne({ where: { topic_id: id } });
  }

  update(id: number, updateTopicDto: UpdateTopicDto) {
    return this.topicRepository.update(id, updateTopicDto);
  }

  remove(id: number) {
    return this.topicRepository.delete(id);
  }
}
