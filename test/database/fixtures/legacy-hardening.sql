CREATE TABLE modarat (modarat_id bigint PRIMARY KEY, user_id bigint NOT NULL);
CREATE TABLE mogak (mogak_id bigint PRIMARY KEY, modarat_id bigint NOT NULL);
CREATE TABLE jogak (
  jogak_id bigint PRIMARY KEY, mogak_id bigint NOT NULL,
  is_routine boolean, start_at date, end_at date
);
CREATE TABLE period (period_id bigint PRIMARY KEY, days varchar(16) NOT NULL);
CREATE TABLE jogak_period (jogak_id bigint NOT NULL, period_id bigint NOT NULL);
CREATE TABLE daily_jogak (
  daily_jogak_id bigint PRIMARY KEY, jogak_id bigint NOT NULL,
  target_date date NOT NULL, is_routine boolean
);
CREATE TABLE post (
  post_id bigint PRIMARY KEY, daily_jogak_id bigint,
  comment_cnt integer, like_cnt integer, view_cnt integer
);
CREATE TABLE post_img (post_img_id bigint PRIMARY KEY, post_id bigint NOT NULL, img_name varchar(255));
CREATE TABLE follow (from_id bigint NOT NULL, to_id bigint NOT NULL);
CREATE TABLE post_like (post_id bigint NOT NULL, user_id bigint NOT NULL);
CREATE TABLE mogak_category (mogak_category_id bigint PRIMARY KEY, name varchar(64) NOT NULL);
CREATE TABLE auth_sessions (id uuid PRIMARY KEY, user_id bigint NOT NULL, expires_at timestamptz NOT NULL);
INSERT INTO modarat VALUES (1, 7);
INSERT INTO mogak VALUES (10, 1);
INSERT INTO jogak VALUES (100, 10, true, DATE '2026-09-07', DATE '2026-12-31');
INSERT INTO jogak VALUES (101, 10, false, DATE '2026-09-08', NULL);
INSERT INTO period VALUES (1, 'MONDAY'), (2, 'WEDNESDAY');
INSERT INTO jogak_period VALUES (100, 1), (100, 2);
