export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_NOTE_LENGTH = 50_000;

// 生产环境必须显式配置密钥类环境变量；缺失时在构建/启动阶段直接报错，
// 避免线上悄悄使用可预测的默认值（旧部署不受影响，新部署会失败并提示）
function requiredSecret(name: "ADMIN_PASSWORD" | "SESSION_SECRET", devFallback: string): string {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`[quick-space] 环境变量 ${name} 未配置，生产环境必须设置`);
  }
  return devFallback;
}

export const APP_CONFIG = {
  defaultSpaceSlug: process.env.DEFAULT_SPACE_SLUG || "public",
  defaultSpaceTitle: process.env.DEFAULT_SPACE_TITLE || "公共空间",
  adminPassword: requiredSecret("ADMIN_PASSWORD", "dev-admin-password"),
  sessionSecret: requiredSecret("SESSION_SECRET", "quick-space-dev-secret"),
  sessionDays: 7,
};
