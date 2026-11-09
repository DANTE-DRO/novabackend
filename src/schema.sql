CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 full_name text NOT NULL, dob text NOT NULL, country text NOT NULL, phone text NOT NULL, language text NOT NULL,
 device_hash text NOT NULL UNIQUE, device_name text NOT NULL, pinned_ip text NOT NULL,
 identity_ref text UNIQUE, identity_state text NOT NULL DEFAULT 'pending',
 email_verified boolean NOT NULL DEFAULT false, interview_passed boolean NOT NULL DEFAULT false,
 quiz_correct integer NOT NULL DEFAULT 0, quiz_attempt integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'onboarding', suspended_until timestamptz,
 errors integer NOT NULL DEFAULT 0, balance_cents integer NOT NULL DEFAULT 0 CHECK (balance_cents>=0),
 reserved_cents integer NOT NULL DEFAULT 0 CHECK (reserved_cents>=0),
 avatar text, contract_version text, signed_at timestamptz, signature text,
 payout_method text, payout_encrypted text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admins (id text PRIMARY KEY,email text NOT NULL UNIQUE,password_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY,user_id text NOT NULL,role text NOT NULL,device_hash text NOT NULL,ip text NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS challenges (
 id text PRIMARY KEY, purpose text NOT NULL, user_id text, nonce text NOT NULL, used boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS email_codes (
 id text PRIMARY KEY,user_id text NOT NULL,kind text NOT NULL,code_hash text NOT NULL,attempts integer NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL,used boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS corpus (id text PRIMARY KEY,source text NOT NULL UNIQUE,category text NOT NULL DEFAULT 'Everyday life',active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS assignments (
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),task_id text NOT NULL REFERENCES corpus(id),
 day text NOT NULL,expires_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'open',answer text,feedback text,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,task_id,day)
);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS grading_started_at timestamptz;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS grading_token text;
CREATE INDEX IF NOT EXISTS assignments_user_day ON assignments(user_id,day);
CREATE TABLE IF NOT EXISTS ledger (
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),kind text NOT NULL,amount_cents integer NOT NULL,
 reference text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payouts (
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),amount_cents integer NOT NULL CHECK(amount_cents>0),
 method text NOT NULL,destination_encrypted text NOT NULL,status text NOT NULL DEFAULT 'requested',provider_ref text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tickets (
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),subject text NOT NULL,status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
 id text PRIMARY KEY,ticket_id text NOT NULL REFERENCES tickets(id),sender text NOT NULL,body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),title text NOT NULL,body text NOT NULL,
 read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS announcements (
 id text PRIMARY KEY,title text NOT NULL,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audits (
 id text PRIMARY KEY,actor text NOT NULL,action text NOT NULL,target text,detail text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_events (id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());

-- Additive migration: preserves existing users, balances and ledger entries.
ALTER TABLE corpus ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}';
ALTER TABLE corpus ADD COLUMN IF NOT EXISTS generated_index integer;
CREATE UNIQUE INDEX IF NOT EXISTS corpus_generated_index ON corpus(generated_index) WHERE generated_index IS NOT NULL;
CREATE INDEX IF NOT EXISTS corpus_translations_language ON corpus USING gin(translations);
CREATE INDEX IF NOT EXISTS assignments_history ON assignments(user_id,task_id);
CREATE TABLE IF NOT EXISTS quiz_questions (
 user_id text NOT NULL REFERENCES users(id), position integer NOT NULL,
 task_id text NOT NULL REFERENCES corpus(id), PRIMARY KEY(user_id,position)
);
CREATE TABLE IF NOT EXISTS verification_submissions (
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),kind text NOT NULL CHECK(kind IN ('identity','interview')),
 status text NOT NULL DEFAULT 'pending', evidence_encrypted text,checks jsonb NOT NULL DEFAULT '{}',
 reason text,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS verification_pending ON verification_submissions(user_id,kind) WHERE status='pending';
CREATE INDEX IF NOT EXISTS verification_expiry ON verification_submissions(expires_at) WHERE evidence_encrypted IS NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS enrolled_selfie text;
UPDATE users SET enrolled_selfie=avatar WHERE identity_state='verified' AND enrolled_selfie IS NULL AND avatar IS NOT NULL;

CREATE TABLE IF NOT EXISTS quiz_answers (
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),position integer NOT NULL,
 task_id text NOT NULL REFERENCES corpus(id),answer text NOT NULL,status text NOT NULL DEFAULT 'review',
 feedback text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,position)
);
