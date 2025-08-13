// Vehicle presets used for selection and balancing
// Each preset controls handling, durability, and impact characteristics

export const VEHICLES = {
  sport: {
    id: 'sport',
    name: 'Racer',
    color: 0xff3b3b,
    shape: 'sport',
    maxHealth: 80,
    maxSpeed: 55,
    acceleration: 80,
    deceleration: 20,
    turnSpeed: 3.2,
    damageDealtMultiplier: 0.95,
    damageTakenMultiplier: 1.2,
    description: 'Fast and agile, but fragile.',
  },
  balanced: {
    id: 'balanced',
    name: 'Striker',
    color: 0x3ddc84,
    shape: 'balanced',
    maxHealth: 100,
    maxSpeed: 45,
    acceleration: 65,
    deceleration: 18,
    turnSpeed: 2.7,
    damageDealtMultiplier: 1.0,
    damageTakenMultiplier: 1.0,
    description: 'Balanced all-rounder.',
  },
  tank: {
    id: 'tank',
    name: 'Bruiser 4x4',
    color: 0x4d9dff,
    shape: 'tank',
    maxHealth: 130,
    maxSpeed: 35,
    acceleration: 50,
    deceleration: 15,
    turnSpeed: 2.2,
    damageDealtMultiplier: 1.25,
    damageTakenMultiplier: 0.8,
    description: 'Heavy, slow, and very tough.',
  },
};

export function getVehicleById(id) {
  return VEHICLES[id] || VEHICLES.balanced;
}


