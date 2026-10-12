import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { PostService } from './post.service.ts';
import { CreatePostDto } from './dto/create-post.dto.ts';
import { UpdatePostDto } from './dto/update-post.dto.ts';

@Controller('post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Post('create')
  create(@Body() createPostDto: CreatePostDto) {
    return this.postService.createPost(createPostDto);
  }

  @Get('list')
  findAll(@Query('published') published?: string) {
    return this.postService.findAll(published);
  }

  @Get('author/:authorId')
  findByAuthor(@Param('authorId', ParseIntPipe) authorId: number) {
    return this.postService.findByAuthor(authorId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.postService.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updatePostDto: UpdatePostDto) {
    return this.postService.update(id, updatePostDto);
  }

  @Patch(':id/publish')
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.postService.publish(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.postService.remove(id);
  }
}
