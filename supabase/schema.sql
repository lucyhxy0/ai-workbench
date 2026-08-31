-- ============================================================
-- AI 工作台 数据库 Schema
-- 在 Supabase SQL Editor 中执行本文件
-- 所有表按 user_id 隔离，启用 RLS 行级安全
-- ============================================================

-- 1. 每日晨报
CREATE TABLE IF NOT EXISTS public.briefings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          date NOT NULL DEFAULT CURRENT_DATE,
  us_market     text DEFAULT '',          -- 美股夜盘
  economy       text DEFAULT '',          -- 经济重要信息
  domestic      text DEFAULT '',          -- 国内重大事项
  summary       text DEFAULT '',          -- AI 综合摘要
  created_at    timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_briefings_user_date ON public.briefings(user_id, date);

-- 2. 饮食
CREATE TABLE IF NOT EXISTS public.diet (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          date NOT NULL DEFAULT CURRENT_DATE,
  breakfast     text DEFAULT '',
  lunch         text DEFAULT '',
  dinner        text DEFAULT '',
  afternoon_tea text DEFAULT '',          -- 下午茶
  drinks        text DEFAULT '',          -- 饮品
  vitamin_d     boolean DEFAULT false,    -- 维生素D
  inositol      boolean DEFAULT false,    -- 肌醇
  custom_checkins jsonb DEFAULT '[]'::jsonb, -- 自定义打卡项 [{id,label,done}]
  weekly_review text DEFAULT '',          -- 每周饮食复盘
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diet_user_date ON public.diet(user_id, date);

-- 3. 操盘复盘
CREATE TABLE IF NOT EXISTS public.trading (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          date NOT NULL DEFAULT CURRENT_DATE,
  operations    text DEFAULT '',          -- 当日操作记录
  review        text DEFAULT '',          -- 复盘笔记
  ai_analysis   text DEFAULT '',          -- AI 分析
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_user_date ON public.trading(user_id, date);

-- 4. 月度固定事务
CREATE TABLE IF NOT EXISTS public.monthly_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,           -- 如：还信用卡、猫咪驱虫
  day_of_month  int NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  category      text DEFAULT '其他',     -- 财务/宠物/健康...
  note          text DEFAULT '',
  last_done     date,                    -- 上次完成日期
  active        boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- 5. 日历事件（一次性重要事项）
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_date    date NOT NULL,
  title         text NOT NULL,
  note          text DEFAULT '',
  event_time    time,                    -- 日计划时间轴（可空）
  importance    int DEFAULT 1,           -- 1 普通 2 重要 3 紧急
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_user_date ON public.calendar_events(user_id, event_date);

-- 6. 对话会话
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text DEFAULT '新对话',
  created_at    timestamptz DEFAULT now()
);

-- 7. 对话消息
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('user','assistant')),
  content       text NOT NULL,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_session ON public.chat_messages(session_id, created_at);

-- ============================================================
-- 启用行级安全 (RLS)
-- ============================================================
ALTER TABLE public.briefings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 通用策略：用户只能操作自己的数据
-- （先 DROP 再 CREATE，保证可重复执行不报 "已存在" 错误）
-- ============================================================
DROP POLICY IF EXISTS "own rows" ON public.briefings;
CREATE POLICY "own rows" ON public.briefings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own rows" ON public.diet;
CREATE POLICY "own rows" ON public.diet
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own rows" ON public.trading;
CREATE POLICY "own rows" ON public.trading
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own rows" ON public.monthly_tasks;
CREATE POLICY "own rows" ON public.monthly_tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own rows" ON public.calendar_events;
CREATE POLICY "own rows" ON public.calendar_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own rows" ON public.chat_sessions;
CREATE POLICY "own rows" ON public.chat_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own rows" ON public.chat_messages;
CREATE POLICY "own rows" ON public.chat_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 触发器：更新 updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_diet_updated ON public.diet;
CREATE TRIGGER trg_diet_updated BEFORE UPDATE ON public.diet
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated();

DROP TRIGGER IF EXISTS trg_trading_updated ON public.trading;
CREATE TRIGGER trg_trading_updated BEFORE UPDATE ON public.trading
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated();

-- ============================================================
-- 2026-08-25 功能扩展：新增字段（幂等，可重复执行）
-- 已建好库的用户，只需在 SQL Editor 执行本段即可追加字段，
-- 不会影响已有数据与策略。
-- ============================================================
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS afternoon_tea text DEFAULT '';
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS drinks text DEFAULT '';
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS vitamin_d boolean DEFAULT false;
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS inositol boolean DEFAULT false;
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS custom_checkins jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS event_time time;

-- 2026-08-27 扩展：卡路里(jsonb) + 维D/肌醇 早/晚 双打卡
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS calories jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS vitamin_d_am boolean DEFAULT false;
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS vitamin_d_pm boolean DEFAULT false;
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS inositol_am boolean DEFAULT false;
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS inositol_pm boolean DEFAULT false;

-- 2026-08-27 扩展：饮食备注 + 身体状况(体重 / 体脂率)
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS note text DEFAULT '';
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS weight numeric;
ALTER TABLE public.diet ADD COLUMN IF NOT EXISTS body_fat numeric;

-- ============================================================
-- 2026-08-25 新增表：自定义打卡项 + 收藏夹 Inbox
-- ============================================================

-- 8. 自定义打卡项（用户级，长期保留，不随日期重置）
CREATE TABLE IF NOT EXISTS public.checkin_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       text NOT NULL,
  done        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.checkin_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own rows" ON public.checkin_items;
CREATE POLICY "own rows" ON public.checkin_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 9. 收藏夹 Inbox（B站/抖音 自动收录 + 自动分类）
CREATE TABLE IF NOT EXISTS public.favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source      text DEFAULT 'bilibili',          -- bilibili / douyin
  title       text NOT NULL,
  url         text DEFAULT '',
  thumb       text DEFAULT '',
  category    text DEFAULT '其他',              -- 猫/经济股票/乐高/做饭/听歌/其他
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fav_user ON public.favorites(user_id, created_at);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own rows" ON public.favorites;
CREATE POLICY "own rows" ON public.favorites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 2026-08-31 新增表：宠物记录（护理 / 健康 / 体重）
-- 幂等，可重复执行
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pet_logs (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date      date NOT NULL DEFAULT CURRENT_DATE,
  category  text NOT NULL DEFAULT '其他',   -- 化毛膏/去毛/剪指甲/外驱/换猫砂/内驱/喂食/体重/洗澡/就医/其他
  note      text DEFAULT '',
  weight    numeric,                          -- 体重 kg（可选）
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pet_user_date ON public.pet_logs(user_id, date);
ALTER TABLE public.pet_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own rows" ON public.pet_logs;
CREATE POLICY "own rows" ON public.pet_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


