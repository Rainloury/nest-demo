import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { UserController } from './user.controller.ts';
import { UserService } from './user.service.ts';

/**
 * Controller 只做「路由 + 参数 + 调用 service」，所以这里把 service 整体换成假对象：
 * 既不需要 PrismaService，也不用启动真实数据库（AGENTS.md 5 / 7）。
 */
type UserServiceMock = {
  createUser: Mock;
  getUserList: Mock;
  getUserById: Mock;
  updateUser: Mock;
  removeUser: Mock;
};

describe('UserController', () => {
  let controller: UserController;
  let service: UserServiceMock;

  beforeEach(async () => {
    service = {
      createUser: vi.fn(),
      getUserList: vi.fn(),
      getUserById: vi.fn(),
      updateUser: vi.fn(),
      removeUser: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: service }],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('create 把请求体原样交给 service，并原样返回结果', async () => {
    const dto = { name: '张三', email: 'a@b.com', password: 'p', role: 'user' as const };
    const response = { success: true, message: '创建用户成功' };
    service.createUser.mockResolvedValue(response);

    await expect(controller.create(dto)).resolves.toBe(response);
    expect(service.createUser).toHaveBeenCalledWith(dto);
  });

  it('list 把查询对象整体透传（分页钳制在 service 内完成）', async () => {
    const query = { page: 2, size: 5, name: '张' };
    const response = { pagination: { page: 2 }, list: [] };
    service.getUserList.mockResolvedValue(response);

    await expect(controller.getUserList(query)).resolves.toBe(response);
    expect(service.getUserList).toHaveBeenCalledWith(query);
  });

  it('getUserById / updateUser / removeUser 分别透传 id 与请求体', async () => {
    await controller.getUserById(3);
    await controller.updateUser(3, { name: '新名字' });
    await controller.removeUser(3);

    expect(service.getUserById).toHaveBeenCalledWith(3);
    expect(service.updateUser).toHaveBeenCalledWith(3, { name: '新名字' });
    expect(service.removeUser).toHaveBeenCalledWith(3);
  });

  it('service 抛出的异常不被 controller 吞掉或改写', async () => {
    const boom = new Error('service 内部错误');
    service.removeUser.mockRejectedValue(boom);

    await expect(controller.removeUser(1)).rejects.toBe(boom);
  });
});
