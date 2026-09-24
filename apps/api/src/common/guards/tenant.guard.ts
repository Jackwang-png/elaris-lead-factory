import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    // Assuming JWT payload contains tenantId
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      return false;
    }
    request.tenantId = tenantId;
    return true;
  }
}
