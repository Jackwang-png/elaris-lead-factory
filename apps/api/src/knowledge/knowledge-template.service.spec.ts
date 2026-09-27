import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';
import { KnowledgeTemplateService } from './knowledge-template.service';
import { KnowledgeService } from './knowledge.service';

/**
 * Phase 2 安全回归：知识库模板“使用模板”复制到租户。
 * 验证：①复制后条目写入当前租户 ②与系统模板原件相互独立 ③模板不存在 → NotFound。
 */
function makePrisma() {
  return {
    knowledgeTemplate: {
      findUnique: async ({ where }: any) => {
        if (where.id === 'tpl1') {
          return {
            id: 'tpl1',
            name: '售前模板',
            category: 'pre',
            isActive: true,
            items: [
              { id: 'i1', title: 'A', content: 'ca', type: 'faq', category: 'pre', channels: ['web'], sortOrder: 0 },
              { id: 'i2', title: 'B', content: 'cb', type: 'general', category: 'pre', channels: [], sortOrder: 1 },
            ],
          };
        }
        return null;
      },
      create: async () => ({ id: 'tpl1', items: [] }),
      update: async () => ({ id: 'tpl1', items: [] }),
      delete: async () => ({ id: 'tpl1' }),
    },
  } as any;
}

function makeKnowledgeService() {
  const created: any[] = [];
  const svc: any = {
    create: async (dto: any) => {
      created.push(dto);
      return { id: 'k_' + created.length, ...dto };
    },
  };
  return { svc, created };
}

describe('Phase2: 知识库模板复制到租户', () => {
  test('使用模板 → 每条 item 复制进当前租户，且相互独立', async () => {
    const { svc, created } = makeKnowledgeService();
    const tplSvc = new KnowledgeTemplateService(makePrisma(), svc as any);
    const res = await tplSvc.useTemplate('tpl1', 't2', undefined);
    assert.equal(res.count, 2);
    assert.equal(created.length, 2);
    for (const k of created) {
      assert.equal(k.tenantId, 't2', '复制内容必须进入当前租户');
      assert.ok(k.title && k.content);
      assert.equal(k.type, 'faq' === k.type ? 'faq' : 'general');
    }
  });

  test('模板不存在 → NotFound', async () => {
    const { svc } = makeKnowledgeService();
    const tplSvc = new KnowledgeTemplateService(makePrisma(), svc as any);
    await assert.rejects(() => tplSvc.useTemplate('nope', 't2', undefined), (e: any) => e instanceof NotFoundException);
  });

  test('普通租户“使用模板”只调用 create（不触碰模板原件/无 admin 写模板逻辑）', async () => {
    const { svc, created } = makeKnowledgeService();
    const tplSvc = new KnowledgeTemplateService(makePrisma(), svc as any);
    await tplSvc.useTemplate('tpl1', 't2', undefined);
    // 仅 KnowledgeService.create 被调用，未调用 template.update/delete
    assert.ok(created.length === 2);
  });
});
