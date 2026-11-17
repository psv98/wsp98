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
    recoverPlayed: 9, recoverRested: 30, // відновлення між турами (зіграв / не виходив)
    // Втома: fat = (1 − st/100)^curveExp ∈ [0, 1] — плавно, без стрибків на межах станів.
    // Кожен канал втрачає частку loss·fat: 60% → ≈13% від максимальної втрати, 40% → ≈33%, 20% → ≈61%, 0% → уся.
    curveExp: 2.2,
    speedLoss: 0.17, // максимальна (при 0%) втрата швидкості
    accelLoss: 0.25, // прискорення та ривки
    attrLoss: 0.13, // удари, передачі, відбори, дриблінг, гра головою
    gkLoss: 0.25, // надійність воротаря (крім тих, хто не втомлюється)
    sigmaGain: 0.6, // зростання розкиду ударів і передач
    powerLoss: 0.12, // сила удару
    miscontrol: 0.12, // шанс поганого прийому мʼяча
    reactionLag: 0.18, // затримка рішень і реакції (секунди)
    // Ризик травм: множник = 1 + (injuryRiskMax − 1)·(1 − st/100)^3
    injuryRiskMax: 5,
    sprintInjury: 0.00012, // базовий шанс травми під час спринту (перевірка ~3 рази на секунду, лише при st < 40)
    maxInjuriesPerTeam: 2, // захист від надмірної кількості травм в одному матчі
    // Витрата сил за матч: частка за час на полі + частка за пробіг і ривки
    drainTimeShare: 0.45, drainDistShare: 0.55, expectedDist: 1700, sprintDrainMul: 1.6,
    // Відновлення за медіакоїни: ціна = missing·costPerPoint·(1 + missing/100·costCurve)
    restoreCostPerPoint: 2, restoreCostCurve: 1.2,
    states: { excellent: 80, normal: 60, tired: 40, heavy: 20 },
    lowThreshold: 40, criticalThreshold: 20,
    aiRestoreBelow: 42, aiRestoreReserve: 5000, aiBenchBelow: 20,
  },

  injuries: { minMatches: 1, maxMatches: 5, treatCostPerMatch: 500 },
  discipline: { yellowsForBan: 4, redBan: 1, directRedBan: 2 },

  economy: {
    startCoins: 1500,
    win: 600, draw: 250, loss: 100, perGoal: 80, cleanSheet: 150, upsetWin: 400, bigWin: 200, hatTrick: 300,
    comebackWin: 250, champion: 10000, top3: 4000, sponsorFallbackMin: 800, sponsorFallbackMax: 2000,
    jackpotMin: 20000, jackpotMax: 30000, marketWindowRounds: 6,
    // економіка клубів-суперників
    clubStartTop: 22000, clubStartBottom: 12000, // стартовий бюджет (за посівом)
    clubSponsorTop: 9000, clubSponsorBottom: 5000, // сезонний спонсорський дохід
    clubPrize: [10000, 7000, 5000, 4000, 3500, 3000, 2600, 2300, 2000, 1800, 1600, 1500, 1400, 1300, 1200, 1100, 1000, 1000],
    clubSoftCap: 150000, // понад цю суму дохід клубу-суперника зменшується вдвічі
    aiDevBudgetShare: 0.25, // частка бюджету, яку суперник може витратити на розвиток за міжсезоння
  },

  development: {
    perSeason: 2, // максимум +2 загального рейтингу за міжсезоння
    costs: [9000, 19000], // ціна першого й другого пункту
    costRatingStep: 0.04, // +4% до ціни за кожен пункт рейтингу понад 85
    cap: 99,
    focusBonus: 3, // бонус до обраної характеристики за кожен пункт розвитку
  },

  market: {
    rarityValue: { rare: 12000, epic: 26000, legendary: 42000, mythic: 70000, divine: 140000, common: 3000 },
    starValueMul: 4, // ринкова ціна зірки = ціна джекпоту × множник
    ratingStep: 0.07, // +7% вартості за кожен пункт рейтингу понад стартовий
    perGoal: 0.01, perAssist: 0.005, perMotm: 0.02, statCap: 0.3,
    importanceMul: 1.15, // ключовий гравець коштує дорожче для продавця
    sellerAskSpread: [1.05, 1.3],
    counterFrom: 0.82, // від цієї частки ціни клуб робить зустрічну пропозицію
    maxRounds: 3,
    rivalChance: 0.55, maxRivals: 3,
    ownerPreference: 0.04, // наскільки продавець може віддати перевагу іншій пропозиції в межах цієї різниці
    incomingOffers: [1, 3],
    aiDealsPerOffseason: 4,
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
