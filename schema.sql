DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    mc_name TEXT,
    roast_context TEXT,
    created_at INTEGER
);

DROP TABLE IF EXISTS battles;
CREATE TABLE battles (
    id TEXT PRIMARY KEY,
    p1_name TEXT,
    p2_name TEXT,
    p1_verse TEXT,
    p2_verse TEXT,
    winner TEXT,
    timestamp INTEGER
);