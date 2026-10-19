import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { CreateTopicDto, CreateSubTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { Roles } from '../common/decorators/roles.decorator';


@Roles(2)
@Controller('topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) { }

  @Post()
  create(@Body() createTopicDto: CreateTopicDto) {
    return this.topicsService.create(createTopicDto);
  }

  @Post('sub-topic')
  createSubTopic(@Body() createSubTopicDto: CreateSubTopicDto) {
    return this.topicsService.createSubTopic(createSubTopicDto);
  }

  @Post(':id/sub-topics')
  createSubTopicWithId(@Param('id') id: string, @Body() createSubTopicDto: any) {
    return this.topicsService.createSubTopic({
      ...createSubTopicDto,
      topic_id: +id
    });
  }

  /** ผู้เรียนใช้เลือกหมวดในหน้า CAT (คลาสนี้ล็อกไว้ที่ @Roles(2)) */
  @Roles(1, 2)
  @Get()
  findAll() {
    return this.topicsService.findAll();
  }

  @Get('stats')
  getTopicStats() {
    return this.topicsService.getTopicStats();
  }

  @Get('sub-topics')
  findAllSubTopics() {
    return this.topicsService.findAllSubTopics();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.topicsService.findOneWithSubTopics(+id);
  }

  @Get(':id/sub-topics')
  findSubTopicsByTopicId(@Param('id') id: string) {
    return this.topicsService.findSubTopicsByTopicId(+id);
  }

  @Get('sub-topic/:id')
  findOneSubTopic(@Param('id') id: string) {
    return this.topicsService.findOneSubTopic(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTopicDto: UpdateTopicDto) {
    return this.topicsService.update(+id, updateTopicDto);
  }

  @Patch('sub-topic/:id')
  updateSubTopic(@Param('id') id: string, @Body() updateData: Partial<CreateSubTopicDto>) {
    return this.topicsService.updateSubTopic(+id, updateData);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.topicsService.remove(+id);
  }

  @Delete('sub-topic/:id')
  removeSubTopic(@Param('id') id: string) {
    return this.topicsService.removeSubTopic(+id);
  }
}
