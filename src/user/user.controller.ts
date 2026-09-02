import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { UserService } from './user.service.ts';
import { CreateUserDto } from './dto/create-user.dto.ts';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Get('user')
  getUserList(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(10), ParseIntPipe) size: number,
  ) {
    // 边界校验：页码与每页条数必须为合法正整数，越界/非法入参回退默认值
    const safePage = page > 0 ? page : 1;
    const safeSize = size > 0 && size <= 100 ? size : 10;

    return this.userService.getUserList(safePage, safeSize);
  }

  @Post('user')
  create(@Body() dto: CreateUserDto) {
    // 防御性脱敏：服务端会将 password 原样回显，返回前剔除敏感字段
    const result = this.userService.createUser(dto) as {
      data?: Record<string, unknown>;
    };
    if (result.data) {
      delete result.data['password'];
    }
    return result;
  }

  @Get('user/:id')
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }
}
