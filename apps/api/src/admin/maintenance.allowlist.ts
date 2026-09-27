export enum MaintenanceAction {
  RETRY_FAILED_TASK = 'RETRY_FAILED_TASK',
  TRIGGER_SYNC = 'TRIGGER_SYNC',
  REGENERATE_KB_INDEX = 'REGENERATE_KB_INDEX',
  REFRESH_CACHE = 'REFRESH_CACHE',
  RELOAD_CONFIG = 'RELOAD_CONFIG',
}

/**
 * 绝对禁止 Agent 自动执行的操作。这类操作只能走“诊断→建议→请求人工确认”
 * 流程（通过 ApprovalService），绝不在自修复端点中被自动执行。
 */
export const FORBIDDEN_AUTO_ACTIONS: string[] = [
  'SCHEMA_CHANGE',
  'DELETE_BUSINESS_DATA',
  'BULK_DELETE_USERS',
  'MODIFY_PERMISSIONS',
  'MODIFY_PAYMENT_STATUS',
  'MODIFY_CREDENTIALS',
  'PROD_DEPLOY',
  'DISABLE_SECURITY',
  'CROSS_TENANT',
];

export function isAllowlisted(action: string): boolean {
  return Object.values(MaintenanceAction).includes(action as MaintenanceAction);
}
