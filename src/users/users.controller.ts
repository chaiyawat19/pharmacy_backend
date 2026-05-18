import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Patch,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Public()
  @Post('/register')
  async register(@Body() createUserDto: CreateUserDto) {
    await this.usersService.register(createUserDto);
    return {
      message: 'User registered successfully',
      status: 201,
    };
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    const user = this.usersService.findByEmail(req.user.email);
    return user;
  }
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(@Request() req, @Body() updateData: UpdateUserDto) {
    const userId = req.user.userId;

    const updatedUser = await this.usersService.updateProfile(
      userId,
      updateData,
    );

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }
}


