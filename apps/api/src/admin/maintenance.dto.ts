import { IsString, IsOptional, IsEnum } from 'class-validator';
import { MaintenanceAction } from './maintenance.allowlist';

export class MaintenanceDto {
  @IsEnum(MaintenanceAction)
  action: MaintenanceAction;

  /**
   * 目标租户 ID。该端点仅 admin 可达，tenantId 为平台管理员显式指定的目标租户，
   * 服务端会校验其真实存在；绝不接受“前端伪造的跨租户”请求。
   */
  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
