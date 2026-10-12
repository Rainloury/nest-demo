import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { PostController } from './post.controller.ts';
import { PostService } from './post.service.ts';

type PostServiceMock = {
  createPost: Mock;
  findAll: Mock;
  findByAuthor: Mock;
  findOne: Mock;
  update: Mock;
  publish: Mock;
  remove: Mock;
};

describe('PostController', () => {
  let controller: PostController;
  let service: PostServiceMock;

  beforeEach(async () => {
    service = {
      createPost: vi.fn(),
      findAll: vi.fn(),
      findByAuthor: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      publish: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostController],
      providers: [{ provide: PostService, useValue: service }],
    }).compile();

    controller = module.get<PostController>(PostController);
  });

  it('create 把请求体交给 createPost', async () => {
    const dto = { title: '标题', content: '正文', authorId: 1 };
    service.createPost.mockResolvedValue({ success: true });

    await expect(controller.create(dto)).resolves.toEqual({ success: true });
    expect(service.createPost).toHaveBeenCalledWith(dto);
  });

  it('findAll 把原始 query 字符串交给 service', async () => {
    service.findAll.mockResolvedValue({ data: [] });

    await controller.findAll('true');
    await controller.findAll('false');

    expect(service.findAll).toHaveBeenNthCalledWith(1, 'true');
    expect(service.findAll).toHaveBeenNthCalledWith(2, 'false');
  });

  it('未传 published 时把 undefined 原样透传，而不是硬转成 false', async () => {
    service.findAll.mockResolvedValue({ data: [] });

    await controller.findAll(undefined);

    expect(service.findAll).toHaveBeenCalledWith(undefined);
  });

  it('findByAuthor / findOne / update / publish / remove 分别透传参数', async () => {
    await controller.findByAuthor(2);
    await controller.findOne(2);
    await controller.update(2, { title: '新标题' });
    await controller.publish(2);
    await controller.remove(2);

    expect(service.findByAuthor).toHaveBeenCalledWith(2);
    expect(service.findOne).toHaveBeenCalledWith(2);
    expect(service.update).toHaveBeenCalledWith(2, { title: '新标题' });
    expect(service.publish).toHaveBeenCalledWith(2);
    expect(service.remove).toHaveBeenCalledWith(2);
  });
});
