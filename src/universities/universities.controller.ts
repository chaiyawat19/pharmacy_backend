import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { UniversitiesService } from './universities.service';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('universities')
export class UniversitiesController {
  constructor(private readonly universitiesService: UniversitiesService) { }

  /** สร้างมหาวิทยาลัยใหม่ — Admin เท่านั้น */
  @Roles(2)
  @Post()
  create(@Body() createUniversityDto: CreateUniversityDto) {
    return this.universitiesService.create(createUniversityDto);
  }

  /** ดึงรายชื่อมหาวิทยาลัยทั้งหมด — Public (ใช้ตอน register) */
  @Public()
  @Get()
  findAll() {
    return this.universitiesService.findAll();
  }

  /** จัดอันดับมหาวิทยาลัยตามคะแนนเฉลี่ย — Public */
  @Public()
  @Get('leaderboard')
  getLeaderboard() {
    return this.universitiesService.getLeaderboard(10);
  }

  /** ดึงมหาวิทยาลัยเฉพาะ ID — ต้อง login */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.universitiesService.findOne(+id);
  }

  /** อัพเดทมหาวิทยาลัย — Admin เท่านั้น */
  @Roles(2)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUniversityDto: UpdateUniversityDto) {
    return this.universitiesService.update(+id, updateUniversityDto);
  }

  /** ลบมหาวิทยาลัย — Admin เท่านั้น */
  @Roles(2)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.universitiesService.remove(+id);
  }
}
