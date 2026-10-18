import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const sessionsTable = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  profileDir: text('profile_dir').notNull(),
  status: text('status').notNull().default('ready'),
  lastCheckedAt: text('last_checked_at'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
});

export const jobsTable = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'image' | 'video'
  provider: text('provider').notNull(), // 'nano_banana' | 'veo_3'
  prompt: text('prompt').notNull(),
  model: text('model').notNull().default(''),
  aspectRatio: text('aspect_ratio').notNull().default('1:1'),
  duration: integer('duration').default(5),
  referenceImageUrl: text('reference_image_url'),
  dependencyJobId: text('dependency_job_id'),
  requiresApproval: integer('requires_approval', { mode: 'boolean' }).default(false),
  approvedByUser: integer('approved_by_user', { mode: 'boolean' }).default(false),
  status: text('status').notNull().default('pending'),
  progress: integer('progress').notNull().default(0),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  errorMessage: text('error_message'),
  outputFile: text('output_file'),
  thumbnailFile: text('thumbnail_file'),
  sessionId: text('session_id'),
  metadata: text('metadata'), // JSON string
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
});

export const settingsTable = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
