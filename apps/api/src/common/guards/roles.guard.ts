import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly allowedRoles: string[]) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.role) {
      throw new ForbiddenException('无权访问');
    }
    if (!this.allowedRoles.includes(user.role)) {
      throw new ForbiddenException('权限不足，需要管理员权限');
    }
    return true;
  }
}

export const AdminGuard = new RolesGuard(['admin']);
