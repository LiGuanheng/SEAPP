export const BALANCE = {
  step: 1 / 60,
  player: { health: 100, radius: 10, speed: 168, sprintSpeed: 260, stamina: 100, staminaDrain: 36, staminaRecovery: 23, sprintRecoveryThreshold: 25, invulnerability: 0.48 },
  weapon: { magazine: 18, interval: 0.16, reload: 1.15, damage: 26, bulletSpeed: 1050, bulletLifetime: 0.85, muzzleDistance: 21 },
  zombie: { health: 64, radius: 11, speed: 62, damage: 14, attackInterval: 0.95, contactDistance: 25, spawnInterval: 3, maxAlive: 28, minSpawnDistance: 470 },
  maxBullets: 48, maxCorpses: 36, maxParticles: 220,
} as const;
