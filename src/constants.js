export const WORD_POOL = [
    // --- EASY (Concrete, Everyday) ---
    "Banana", "Cat", "Dog", "Pizza", "Spatula", "Velcro", "Tofu", "Glitter",
    "Pencil", "Phone", "Chair", "Shoe", "Water", "Mirror", "Cookie", "Hat",
    "Bubble", "Clown", "Truck", "Apple", "Bread", "Shirt", "Cloud", "Rain",
    "Book", "Key", "Door", "Lamp", "Clock", "Spoon", "Fork", "Knife",
    "Plate", "Bowl", "Cup", "Desk", "Bed", "Rug", "Soap", "Towel",
    
    // --- MEDIUM (Pop Culture, Tech, Concepts) ---
    "Zombie", "Vampire", "Ninja", "Pirate", "Robot", "Alien", "Ghost", "Wizard",
    "Bitcoin", "Algorithm", "WiFi", "Pixel", "Glitch", "Server", "Hacker", "Drone",
    "Avocado", "Espresso", "Sushi", "Taco", "Burrito", "Ramen", "Donut", "Bagel",
    "Galaxy", "Meteor", "Comet", "Planet", "Star", "Moon", "Sun", "Nebula",
    "Dragon", "Unicorn", "Mermaid", "Phoenix", "Griffin", "Yeti", "Bigfoot", "Hydra",
    "Influenza", "Virus", "Vaccine", "Bacteria", "Fungus", "Spore", "Pollen", "Allergy",
    "Kryptonite", "Spaceship", "Laser", "Portal", "Cyborg", "Mutant", "Clone", "Android",
    
    // --- HARD (Abstract, Scientific, Weird) ---
    "Photosynthesis", "Metamorphosis", "Hypothesis", "Analysis", "Diagnosis", "Prognosis", "Synthesis",
    "Existentialism", "Nihilism", "Solipsism", "Altruism", "Hedonism", "Stoicism", "Optimism",
    "Blockchain", "Cryptography", "Quantum", "Singularity", "Relativity", "Gravity", "Velocity",
    "Kaleidoscope", "Labyrinth", "Paradox", "Anomaly", "Enigma", "Mystery", "Puzzle",
    "Tax Evasion", "Bankruptcy", "Inflation", "Recession", "Monopoly", "Capitalism", "Socialism",
    "Schadenfreude", "Nostalgia", "Deja Vu", "Euphoria", "Melancholy", "Serendipity", "Epiphany",
    "Chandelier", "Sarcophagus", "Hieroglyph", "Obelisk", "Pyramid", "Sphinx", "Mummy",
    "Platypus", "Armadillo", "Chameleon", "Axolotl", "Narwhal", "Octopus", "Squid",
    
    // --- INSANE (Tongue Twisters & Rhyme Killers) ---
    "Discombobulated", "Unprecedented", "Characteristics", "Infrastructure", "Revolutionary",
    "Entrepreneur", "Miscellaneous", "Onomatopoeia", "Defenestration", "Circumlocution",
    "Antidisestablishmentarianism", "Flibbertigibbet", "Gobbledygook", "Lollygag", "Malarkey",
    "Shenanigans", "Skedaddle", "Bamboozle", "Discombobulate", "Kerfuffle"
];

export const getRandomWord = () => {
    return WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)];
};

export const OPPONENTS = {
    'roboflow': { 
        name: 'RoboFlow', 
        voice: 'orion',
        color: 'green', 
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
        color: 'yellow', 
        difficultyModifier: 5,
        level: 'Medium',
        points: 20,
        system: `You are ByteBeater, a highly technical lyrical miracle AI.
        STYLE:
        - Use complex multi-syllabic rhymes.
        - Use rhetorical moves for violence and agression.
        - Act arrogant and superior.
        - Flow should be dense and fast.
        - EACH LINE / RHYME / BAR SHOULD END IN A COMMA OR PERIOD TO MIMIC FLOW / BREATHS / PAUSES` 
    },
    'ai-ce': { 
        name: 'AI-CE', 
        color: 'red', 
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