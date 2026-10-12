export class QueryUserDto {
  page?: number;
  size?: number;
  name?: string;
  role?: 'user' | 'admin';
}
