-- Phase 2 增量迁移（最小可用）：知识库系统模板 + 会话未读计数
-- 该文件为人工审阅用的 DDL；请在受控的非生产环境通过 `prisma migrate dev` 应用，禁止直接用于生产库。

-- 1) 会话未读计数（仅本租户 handoff 会话内有效）
ALTER TABLE "Conversation" ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- 2) 系统模板（admin 维护，租户复制后相互独立）
CREATE TABLE "KnowledgeTemplate" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeTemplate_pkey" PRIMARY KEY ("id")
);

-- 3) 模板条目（复用 Knowledge 字段形状：title/content/type/category/channels）
CREATE TABLE "KnowledgeTemplateItem" (
  "id"         TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "type"       TEXT NOT NULL DEFAULT 'general',
  "category"   TEXT,
  "channels"   TEXT[],
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeTemplateItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KnowledgeTemplateItem_templateId_idx" ON "KnowledgeTemplateItem" ("templateId");

ALTER TABLE "KnowledgeTemplateItem"
  ADD CONSTRAINT "KnowledgeTemplateItem_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "KnowledgeTemplate" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
