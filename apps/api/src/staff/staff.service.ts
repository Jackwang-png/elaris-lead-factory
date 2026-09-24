import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateStaffDto } from './staff.dto';
import * as bcrypt from 'bcryptjs';

export const STAFF_ROLE = 'CUSTOMER_SERVICE';

export interface StaffView {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  tenantId: string;
  createdAt: Date;
  lastLogin: Date | null;
}

@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  private toView(u: any): StaffView {
    return {
      id: u.id,
      email: u.email,
      name: u.firstName || u.name || u.username || null,
      role: u.role,
      isActive: u.isActive,
      tenantId: u.tenantId,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin ?? null,
    };
  }

  private readonly select = {
    id: true,
    email: true,
    firstName: true,
    name: true,
    username: true,
    role: true,
    isActive: true,
    tenantId: true,
    createdAt: true,
    lastLogin: true,
  };

  /** OWNER 查看自己 Tenant 的员工（仅 CUSTOMER_SERVICE） */
  async listStaff(tenantId: string): Promise<StaffView[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId, role: STAFF_ROLE },
      select: this.select,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.toView(u));
  }

  /**
   * OWNER 创建员工。
   * tenantId 必须来自 JWT（req.tenantId），绝不接受客户端传入，
   * 确保员工绑定 OWNER 的 Tenant，且不会成为新的 Tenant owner。
   */
  async createStaff(
    tenantId: string,
    actorUserId: string,
    dto: CreateStaffDto,
  ): Promise<StaffView> {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException('该邮箱已注册');
    }
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.name,
        name: dto.name,
        password: hashedPassword,
        tenantId, // 来自 JWT，禁止客户端指定
        role: STAFF_ROLE,
        isActive: true,
      },
      select: this.select,
    });
    const view = this.toView(user);
    await this.auditService
      .log({
        action: 'STAFF_CREATED',
        resource: 'User',
        resourceId: view.id,
        tenantId,
        userId: actorUserId,
        detail: { email: view.email, role: STAFF_ROLE },
        success: true,
      })
      .catch(() => undefined);
    return view;
  }

  /**
   * OWNER 禁用/启用员工。
   * - tenantId 来自 JWT：findFirst 按 (id + tenantId) 定位，跨租户视为不存在 → 404（不泄漏他租户信息）
   * - 禁止操作自己、商家所有者(merchant)、平台管理员(admin)
   * - 禁用是 update(isActive)，不删除任何 User/Conversation/AuditLog/订单
   */
  async setStaffActive(
    tenantId: string,
    actorUserId: string,
    staffId: string,
    active: boolean,
  ): Promise<StaffView> {
    const target = await this.prisma.user.findFirst({
      where: { id: staffId, tenantId },
      select: { id: true, email: true, role: true },
    });
    if (!target) {
      throw new NotFoundException('员工不存在');
    }
    if (target.id === actorUserId) {
      throw new ForbiddenException('不能操作自己');
    }
    if (target.role === 'merchant' || target.role === 'admin') {
      throw new ForbiddenException('不能禁用商家所有者或管理员');
    }
    const updated = await this.prisma.user.update({
      where: { id: staffId },
      data: { isActive: active },
      select: this.select,
    });
    await this.auditService
      .log({
        action: 'STAFF_DISABLED',
        resource: 'User',
        resourceId: staffId,
        tenantId,
        userId: actorUserId,
        detail: { email: updated.email, isActive: active },
        success: true,
      })
      .catch(() => undefined);
    return this.toView(updated);
  }
}
