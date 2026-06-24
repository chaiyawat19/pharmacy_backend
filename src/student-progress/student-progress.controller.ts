import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { StudentProgressService } from './student-progress.service';

@Roles(2)
@Controller('admin')
export class StudentProgressController {
  constructor(
    private readonly studentProgressService: StudentProgressService,
  ) {}

  @Roles(2)
  @Get('students')
  getStudents(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search = '',
  ) {
    return this.studentProgressService.getStudents({
      page: Number(page),
      limit: Number(limit),
      search,
    });
  }

  @Roles(2)
  @Get('students/:id/progress')
  getStudentProgress(@Param('id', ParseIntPipe) id: number) {
    return this.studentProgressService.getStudentProgress(id);
  }
}
