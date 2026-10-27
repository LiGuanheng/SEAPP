CREATE TABLE scores (
  id uuid PRIMARY KEY,
  nickname varchar(32) NOT NULL CHECK (char_length(nickname) BETWEEN 2 AND 16),
  difficulty text NOT NULL CHECK (difficulty IN ('normal', 'hard')),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 120000 AND 86400000),
  score integer NOT NULL CHECK (score BETWEEN 10000 AND 23800),
  max_speed smallint NOT NULL CHECK (max_speed BETWEEN 1 AND 3),
  score_version integer NOT NULL CHECK (score_version = 1),
  game_version text NOT NULL CHECK (game_version = '0.12.0'),
  stages jsonb NOT NULL CHECK (jsonb_typeof(stages) = 'array' AND jsonb_array_length(stages) = 3),
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scores_speed_idx ON scores (difficulty, score_version, duration_ms ASC, score DESC, submitted_at ASC, id ASC);
CREATE INDEX scores_score_idx ON scores (difficulty, score_version, score DESC, duration_ms ASC, submitted_at ASC, id ASC);
