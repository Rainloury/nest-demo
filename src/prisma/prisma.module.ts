import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.ts';

/**
 * @Global() 让所有功能模块可直接注入 PrismaService，
 * 不必在每个模块里重复 import PrismaModule。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
