-- migrations/0013_early_join.sql
-- Early join: how many minutes before a delivery's start time its students may join (0 = only at
-- the start time). A delivery opened early waits, with no clock running, and starts itself at its
-- start time; when it opens with a Bellwork, students may start that early. Per class, default 3.
ALTER TABLE classes ADD COLUMN early_join_min INTEGER NOT NULL DEFAULT 3;
