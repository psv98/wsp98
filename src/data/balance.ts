// ЄДИНА централізована конфігурація балансу. Усі числові параметри гри змінюються тут.
export const BALANCE = {
  clubs: { topStrength: 82, strengthStep: 0.85, homeBonus: 1.6 },

  match: {
    halfSeconds: 90, // реальних секунд на тайм
    stoppageMin: 2, stoppageMax: 5, // компенсований час у секундах
    lastAttackMaxExtra: 7,
    maxSubs: 5,
    dt: 1 / 60,
  },

  pitch: { L: 105, W: 68, goalHalf: 3.9, boxDepth: 16.5, boxHalf: 20.15, sixDepth: 5.5, sixHalf: 9.15, penSpot: 11, circle: 9.15 },

  sim: {
    baseSpeed: 7.4, speedPerQ: 0.035, accel: 24, carrySpeed: 0.9, jogFactor: 0.72,
    roleSpeed: { GK: -0.6, CB: -0.25, FB: 0.2, DM: -0.1, CM: 0, AM: 0.1, W: 0.5, ST: 0.3 } as Record<string, number>,
    ballFriction: 5.5, shotFriction: 2.0, gravity: 14,
    controlRadius: 1.0, gkControlRadius: 1.5,
    tackleRange: 1.45, tackleCooldown: 1.15, tackleBase: 0.36, tackleMin: 0.1, tackleMax: 0.78,
    beatenStun: 0.65, tackledStun: 0.45,
    foulChance: 0.24, tackleOutChance: 0.45, yellowChance: 0.2, redChance: 0.013, penaltyFoulFactor: 0.28,
    injuryOnFoul: 0.035, injuryOnDuel: 0.0035, injuryFatigueFactor: 2.2,
    interceptBase: 0.32, blockBase: 0.2, blockRange: 9,
    shootRange: 27, shotSpeed: 27, shotSigmaBase: 0.045, shotSigmaSkill: 0.11, shotSigmaDist: 0.0013, shotPressure: 0.035,
    overBarBase: 0.05, overBarDist: 0.004,
    saveBase: 0.5, saveGk: 0.012, saveDist: 0.013, saveCentral: 0.24, saveShoot: 0.006, saveMin: 0.06, saveMax: 0.9,
    headerSaveBonus: 0.08, headerOnTarget: 0.55,
    passSigma: 0.1, loftSpeed: 18, loftScatter: 3.2,
    penaltyOnTarget: 0.88, penaltySave: 0.22, penaltySaveSpecialCap: 0.5,
    qEffect: 0.4, // множник впливу різниці рейтингів (менше = більше сенсацій)
    staminaDrainStart: 26, // % витривалості, які забирає повний матч
    fatigueFloor: 0.88, // множник характеристик при 0% витривалості
    goldenMinuteDuration: 10, goldenMinuteBoost: 5,
    aiSubFrom: 110, // секунда матчу, після якої ШІ робить заміни
    varOverturn: { goal: 0.4, penalty: 0.45, red: 0.5 }, varGoalContested: 0.45, aiVarUse: 0.7,
    stormCrossToIhor: 0.6, stormHeaderGoal: 0.7, stormDuelWin: 0.75,
    emptyNetRange: 48,
    teamBonusCap: 6,
  },

  fatigue: {
    recoverPlayed: 9, recoverRested: 30, // відновлення між турами
    restoreCostPerPoint: 3, // MC за 1% витривалості одного гравця
    lowThreshold: 55,
  },

  injuries: { minMatches: 1, maxMatches: 5, treatCostPerMatch: 500 },
  discipline: { yellowsForBan: 4, redBan: 1, directRedBan: 2 },

  economy: {
    startCoins: 1500,
    win: 600, draw: 250, loss: 100, perGoal: 80, cleanSheet: 150, upsetWin: 400, bigWin: 200, hatTrick: 300,
    comebackWin: 250, champion: 10000, top3: 4000, sponsorFallbackMin: 800, sponsorFallbackMax: 2000,
    jackpotMin: 20000, jackpotMax: 30000, marketWindowRounds: 6,
  },

  transfers: {
    dropChance: 0.36, // шанс випадіння після матчу
    pityMatches: 3, // максимум матчів без випадіння
    // ваги категорій у пулі користувача
    weights: { divine: 1.2, mythic: 5, legendary: 9, epic: 36, rare: 40, jackpot: 5, sponsor: 20 },
    stealFactor: 0.12, // множник ваги, якщо персонаж уже грає за суперника («сюжетний перехід»)
    aiFromRound: 5, // з якого туру суперники отримують трансфери
    aiRoundChance: 0.2, // шанс, що в турі один із суперників отримає персонажа
    aiMaxPerSeason: 5,
    aiWeights: { divine: 2, mythic: 8, legendary: 12, epic: 40, rare: 38 },
    oksanaForceRound: 26, // якщо Оксана ніде не зʼявилась — гарантована поява в цьому турі
    aiStarsFromSeason: 2, aiStarChance: 0.07,
    ihorStormMin: 5, ihorStormMax: 7,
  },

  seasons: { aiGrowthPerSeason: 1.2, aiGrowthCap: 6 },

  upsetGap: 8, // різниця сили для «Сенсації туру»
} as const;

export type Balance = typeof BALANCE;
