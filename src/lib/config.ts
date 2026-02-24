export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_NOTE_LENGTH = 50_000;

export const APP_CONFIG = {
  defaultSpaceSlug: process.env.DEFAULT_SPACE_SLUG || "public",
  defaultSpaceTitle: process.env.DEFAULT_SPACE_TITLE || "公共空间",
  adminPassword: process.env.ADMIN_PASSWORD || "6322Kay",
  sessionSecret: process.env.SESSION_SECRET || "quick-space-dev-secret",
  sessionDays: 7,
};
