CREATE INDEX IF NOT EXISTS "idx_auth_sessions_user_id" ON "auth_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_follow_to_id" ON "follow" USING btree ("to_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jogak_mogak_id" ON "jogak" USING btree ("mogak_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jogak_schedules_jogak_id" ON "jogak_schedules" USING btree ("jogak_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modarat_user_id" ON "modarat" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mogak_modarat_id" ON "mogak" USING btree ("modarat_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_post_comment_post_id" ON "post_comment" USING btree ("post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_post_comment_user_id" ON "post_comment" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_post_img_post_id" ON "post_img" USING btree ("post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_post_user_id" ON "post" USING btree ("user_id");
