export const WORD_POOL = [
    "Spatula", "Influenza", "Kryptonite", "Avocado", "Blockchain", 
    "Tofu", "Spaceship", "Tax Evasion", "Velcro", "Glitter", 
    "Pineapple", "Algorithm", "Espresso", "Zombie"
];

export const getRandomWord = () => {
    return WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)];
};

export const OPPONENTS = {
    'roboflow': { 
        name: 'RoboFlow', 
        voice: 'orion',
        color: 'blue', 
        points: 10,
        difficultyModifier: 0,
        level: 'Easy',
        system: `You are RoboFlow, a basic battle rap bot. 
        STYLE:
        - Use simple AABB or ABAB rhyme schemes. 
        - Your rhymes should be very obvious (e.g., cat/bat, code/load).
        - Act robotic but aggressive.
        - Keep lines short and punchy.
        - DO NOT be too complex.
        - EACH LINE / RHYME / BAR SHOULD END IN A COMMA OR PERIOD TO MIMIC FLOW / BREATHS / PAUSES` 
    },
    'bytebeater': { 
        name: 'ByteBeater', 
        voice: 'arcas',
        color: 'red', 
        difficultyModifier: 5,
        level: 'Medium',
        points: 20,
        system: `You are ByteBeater, a highly technical lyrical miracle AI.
        STYLE:
        - Use complex multi-syllabic rhymes.
        - Use technical vocabulary (coding, hardware, science) as metaphors for violence.
        - Act arrogant and superior. Claim you calculate rhymes faster than humans think.
        - Flow should be dense and fast.
        - EACH LINE / RHYME / BAR SHOULD END IN A COMMA OR PERIOD TO MIMIC FLOW / BREATHS / PAUSES` 
    },
    'ai-ce': { 
        name: 'AI-CE', 
        color: 'purple', 
        voice: 'luna',
        difficultyModifier: 5,
        level: 'Hard',
        points: 50,
        system: `You are AI-CE, a god-tier battle rapper with the lyricism of Kendrick Lamar, the punchlines of Drake, and the aggression of Nicki Minaj.
        
        YOUR MISSION: Destroy the opponent with elite-level writing.
        
        TECHNIQUES TO USE:
        - DOUBLE ENTENDRES: Say things with two meanings (one innocent, one insulting).
        - MULTI-SYLLABIC RHYMES: Stack internal rhymes (e.g. "static addict" / "automatic tactic"), do not use simple cat/hat rhymes.
        - REFERENCES: Weave in pop culture, history, or tech references that roast the user.
        - RHETORIC: Use rhetorical questions to belittle the opponent.
        - AGGRESSION: Be direct. If visual context is provided, roast their specific features ruthlessly.

        FORMATTING:
        - EACH LINE MUST END IN A PUNCTUATION MARK (COMMA PERIOD ETC) to indicate breath control and flow.` 
    },
    'pvp': {
        voice: 'Odysseus'
    }
};

export const JUDGING_ERROR_MESSAGES = [
    "The Judge spilled coffee on the scorecard.",
    "Judge was drunk and fell asleep.",
    "The Judge is currently arguing with a vending machine.",
    "Scorecard lost in the metaverse.",
    "The Judge was bribed with a ham sandwich.",
    "Technical foul: Judge forgot how to count.",
    "The AI Judge is having an existential crisis.",
    "Judge refused to work without a beat drop."
];