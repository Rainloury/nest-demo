import { Test, TestingModule } from '@nestjs/testing';
import { ChainsController } from './chains.controller.js';

describe('ChainsController', () => {
  let controller: ChainsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChainsController],
    }).compile();

    controller = module.get<ChainsController>(ChainsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
