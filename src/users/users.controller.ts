import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { Public } from '../common/decorators/public.decorator'; 
import { Roles } from '../common/decorators/role.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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


  @Get('profile')
  getProfile(@Request() req) {
    const user = this.usersService.findByEmail(req.user.email);
    return user;
  }

}

@Controller('admin')
export class AdminController {
  @Roles(2) // 2 = admin
  @Get('dashboard')
  dashboard() {
    return "Welcome to the admin dashboard!";
  }
}
