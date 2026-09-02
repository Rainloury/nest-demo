import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.ts';

@Injectable()
export class UserService {
  getUserList(page: number, size: number) {
    const currentPage = page || 1;
    const pageSize = size || 10;

    return {
      page: currentPage,
      size: pageSize,
      total: 100,
      message: `第 ${currentPage} 页，每页 ${pageSize} 条`,
    };
  }
  createUser(dto: CreateUserDto) {
    return {
      success: true,
      message: '创建用户成功',
      timestamp: new Date().toISOString(),
      data: {
        id: Date.now(),
        name: dto.name,
        age: dto.age,
        gender: dto.gender,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        password: dto.password,
      },
    };
  }
  getUserById(id: string) {
    return {
      success: true,
      message: `获取用户${id}成功`,
      timestamp: new Date().toISOString(),
    };
  }
}
