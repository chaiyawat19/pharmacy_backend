import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetUserRoleDto } from './dto/set-user-role.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AuthService } from '../auth/auth.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) { }

  @Public()
  @Post('/register')
  async register(@Body() body: CreateUserDto & { otp: string }) {
    const { otp, ...createUserDto } = body;

    if (!otp) {
      throw new BadRequestException('กรุณาระบุรหัส OTP');
    }

    // ตรวจสอบ OTP ก่อนสร้าง user (จะ throw ข้อความเฉพาะเจาะจงถ้าหมดอายุหรือไม่ถูกต้อง)
    await this.authService.verifyOTP(createUserDto.email, otp);

    await this.usersService.register(createUserDto);
    return {
      message: 'สมัครสมาชิกสำเร็จเรียบร้อย',
      status: 201,
    };
  }

  @Roles(2)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Roles(2)
  @Post('/admin')
  async createAdmin(@Body() createUserDto: CreateUserDto) {
    const user = await this.usersService.createAdmin(createUserDto);
    return {
      message: 'สร้างบัญชีผู้ดูแลระบบสำเร็จเรียบร้อย',
      data: user,
    };
  }
  // ── จัดการผู้ใช้ (Super Admin เท่านั้น) ────────────────────────────────────
  // NOTE: ประกาศ 'deleted' ไว้ก่อน ':id' ไม่งั้น route param จะกลืนไปเป็น id='deleted'

  /** [Super Admin] รายชื่อผู้ใช้ที่ถูกลบไปแล้ว (ถังขยะ) */
  @Roles(3)
  @Get('deleted')
  findDeleted() {
    return this.usersService.findDeleted();
  }

  /** [Super Admin] ลบผู้ใช้แบบ soft delete — กู้คืนได้ ประวัติไม่หาย */
  @Roles(3)
  @Delete(':id')
  removeUser(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.softDeleteUser(id, req.user.userId);
  }

  /** [Super Admin] กู้คืนผู้ใช้ที่ถูกลบ */
  @Roles(3)
  @Post(':id/restore')
  restoreUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.restoreUser(id);
  }

  /** [Super Admin] ถอด/ให้สิทธิ์ผู้ดูแลระบบ — role_id เป็น null คือคืนค่าอัตโนมัติ */
  @Roles(3)
  @Patch(':id/role')
  setUserRole(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetUserRoleDto,
  ) {
    return this.usersService.setRole(id, dto.role_id ?? null, req.user.userId);
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

  @UseGuards(JwtAuthGuard)
  @Post('profile/picture')
  @UseInterceptors(
    FileInterceptor('profile_picture', {
      storage: diskStorage({
        destination: './uploads/profiles',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `profile-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed!'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  async uploadProfilePicture(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const userId = req.user.userId;
    const profilePictureUrl = `/uploads/profiles/${file.filename}`;

    const updatedUser = await this.usersService.updateProfile(userId, {
      profile_picture: profilePictureUrl,
    });

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * [Super Admin] ข้อมูลสรุปของผู้ใช้หนึ่งคน
   * ประกาศไว้ท้ายสุดเพราะ ':id' จะกลืน route คงที่อย่าง 'profile'/'deleted' ที่อยู่หลังมัน
   */
  @Roles(3)
  @Get(':id')
  findOneDetail(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOneDetail(id);
  }
}
