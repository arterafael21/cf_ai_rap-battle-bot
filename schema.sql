CREATE TABLE IF NOT EXISTS battles (
    id TEXT PRIMARY KEY, 
    p1_name TEXT, 
    p2_name TEXT, 
    p1_verse TEXT, 
    p2_verse TEXT, 
    winner TEXT, 
    timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,       -- The Clerk User ID
    mc_name TEXT,             -- Custom Rapper Name
    avatar_url TEXT,          -- Link to the image
    roast_context TEXT,       -- AI description of their look
    created_at INTEGER
);