import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class CreateStaffDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class SetStaffActiveDto {
  /** true=重新启用，false/缺省=禁用。仅 OWNER 可操作。 */
  @IsOptional()
  active?: boolean;
}
