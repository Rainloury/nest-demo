import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { UserService } from './user.service.ts';
import { CreateUserDto } from './dto/create-user.dto.ts';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Get('getUserList')
  getUserList(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(10), ParseIntPipe) size: number,
  ) {
    // 边界校验：页码与每页条数必须为合法正整数，越界/非法入参回退默认值
    const safePage = page > 0 ? page : 1;
    const safeSize = size > 0 && size <= 100 ? size : 10;

    return this.userService.getUserList(safePage, safeSize);
  }

  @Post('createUser')
  create(@Body() dto: CreateUserDto) {
    const result = this.userService.createUser(dto) as {
      data?: Record<string, unknown>;
    };
    return result;
  }

  @Get('getUserById/:id')
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }
}
