ALTER TABLE "auth_sessions" DROP CONSTRAINT "auth_sessions_user_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "follow" DROP CONSTRAINT "follow_from_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_from_id_users_user_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "follow" DROP CONSTRAINT "follow_to_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_to_id_users_user_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "modarat" DROP CONSTRAINT "modarat_user_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "modarat" ADD CONSTRAINT "modarat_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "post" DROP CONSTRAINT "post_user_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "post_comment" DROP CONSTRAINT "post_comment_post_id_post_post_id_fk";
--> statement-breakpoint
ALTER TABLE "post_comment" ADD CONSTRAINT "post_comment_post_id_post_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("post_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "post_comment" DROP CONSTRAINT "post_comment_user_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "post_comment" ADD CONSTRAINT "post_comment_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "post_img" DROP CONSTRAINT "post_img_post_id_post_post_id_fk";
--> statement-breakpoint
ALTER TABLE "post_img" ADD CONSTRAINT "post_img_post_id_post_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("post_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "post_like" DROP CONSTRAINT "post_like_post_id_post_post_id_fk";
--> statement-breakpoint
ALTER TABLE "post_like" ADD CONSTRAINT "post_like_post_id_post_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("post_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "post_like" DROP CONSTRAINT "post_like_user_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "post_like" ADD CONSTRAINT "post_like_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "social_account" DROP CONSTRAINT "social_account_user_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "user_consent" DROP CONSTRAINT "user_consent_user_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_consent" ADD CONSTRAINT "user_consent_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
