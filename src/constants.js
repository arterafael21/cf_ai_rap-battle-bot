export const WORD_POOL = [
    "Spatula", "Influenza", "Kryptonite", "Avocado", "Blockchain", 
    "Tofu", "Spaceship", "Tax Evasion", "Velcro", "Glitter", 
    "Pineapple", "Algorithm", "Espresso", "Zombie"
];

export const getRandomWord = () => {
    return WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)];
};

export const OPPONENTS = {
    'roboflow': { name: 'RoboFlow', color: 'blue', style: 'Basic (AABB)' },
    'bytebeater': { name: 'ByteBeater', color: 'red', style: 'Technical' },
    'ai-ce': { name: 'AI-CE', color: 'orange', style: 'Funny' }
};