import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  company?: string;

  // T2.9: plan must be a real Plan name — arbitrary strings are rejected.
  @IsOptional()
  @IsIn(['FREE', 'BASIC', 'PRO', 'ENTERPRISE'])
  plan?: string;

  // L2: 注册邀请码（REGISTER_INVITE_REQUIRED=true 时必填，ADMIN_INVITE）
  @IsOptional()
  @IsString()
  inviteCode?: string;

  // GROWTH-STAFF-05: 用户推荐码（USER_REFERRAL），注册成功后双方 +3 天
  @IsOptional()
  @IsString()
  referralCode?: string;
}
