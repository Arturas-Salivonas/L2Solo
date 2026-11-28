'use strict';

// The Coliseum (near Aden): where Last Hero is fought.
//
// The fight floor is the C4 arena zone of L2JLisvus (datapack/data/zones/arenaZones.xml,
// zone 11012 "Coliseum", Z -3500..-3300) and its restart point (restartPoints.xml,
// group "coliseum"). The floor is flat at Z -3408 in the server's own geodata.
//
// SPAWNS: 136 points on a 210 grid where geodata finds that floor around each point
// (8 neighbours 150 away), inside the zone, away from the east and west gates.
// Regenerate them from geodata if the zone ever changes; tests/test_last_hero.js checks
// every one is inside POLYGON.

const FLOOR_Z = -3408;
const MIN_Z = -3500;
const MAX_Z = -3300;

const POLYGON = Object.freeze([
    [147784, 45100], [151220, 45100], [151220, 46200], [150960, 46500],
    [150960, 46940], [151220, 47240], [151220, 48200], [147784, 48200],
    [147784, 47240], [148040, 46940], [148040, 46500], [147784, 46200]
].map((point) => Object.freeze(point)));

// Outside the west gate: where a fallen fighter stands back up and can watch.
const EXIT = Object.freeze({ locX: 147451, locY: 46728, locZ: -3410 });
const CENTER = Object.freeze({ locX: 149500, locY: 46650, locZ: FLOOR_Z });

const SPAWNS = Object.freeze([
    [150520, 45400], [148420, 45610], [148630, 45610], [148840, 45610], [149050, 45610], [149260, 45610], [149470, 45610], [149680, 45610],
    [149890, 45610], [150100, 45610], [150310, 45610], [150520, 45610], [148210, 45820], [148420, 45820], [148630, 45820], [148840, 45820],
    [149050, 45820], [149260, 45820], [149470, 45820], [149680, 45820], [149890, 45820], [150100, 45820], [150310, 45820], [150520, 45820],
    [150730, 45820], [148000, 46030], [148210, 46030], [148420, 46030], [148630, 46030], [148840, 46030], [149050, 46030], [149260, 46030],
    [149470, 46030], [149680, 46030], [149890, 46030], [150100, 46030], [150310, 46030], [150520, 46030], [150730, 46030], [150940, 46030],
    [148210, 46240], [148420, 46240], [148630, 46240], [148840, 46240], [149050, 46240], [149260, 46240], [149470, 46240], [149680, 46240],
    [149890, 46240], [150100, 46240], [150310, 46240], [150520, 46240], [150730, 46240], [148630, 46450], [148840, 46450], [149050, 46450],
    [149260, 46450], [149470, 46450], [149680, 46450], [149890, 46450], [150100, 46450], [150310, 46450], [150520, 46450], [148630, 46660],
    [148840, 46660], [149050, 46660], [149260, 46660], [149470, 46660], [149680, 46660], [149890, 46660], [150100, 46660], [150310, 46660],
    [150520, 46660], [148630, 46870], [148840, 46870], [149050, 46870], [149260, 46870], [149470, 46870], [149680, 46870], [149890, 46870],
    [150100, 46870], [150310, 46870], [150520, 46870], [148630, 47080], [148840, 47080], [149050, 47080], [149260, 47080], [149470, 47080],
    [149680, 47080], [149890, 47080], [150100, 47080], [150310, 47080], [150520, 47080], [148000, 47290], [148210, 47290], [148420, 47290],
    [148630, 47290], [148840, 47290], [149050, 47290], [149260, 47290], [149470, 47290], [149680, 47290], [149890, 47290], [150100, 47290],
    [150310, 47290], [150520, 47290], [150730, 47290], [150940, 47290], [148210, 47500], [148420, 47500], [148630, 47500], [148840, 47500],
    [149050, 47500], [149260, 47500], [149470, 47500], [149680, 47500], [149890, 47500], [150100, 47500], [150310, 47500], [150520, 47500],
    [150730, 47500], [150940, 47500], [148210, 47710], [148420, 47710], [148630, 47710], [148840, 47710], [149050, 47710], [149260, 47710],
    [149470, 47710], [149680, 47710], [149890, 47710], [150100, 47710], [150310, 47710], [150520, 47710], [150730, 47710], [148210, 47920]
].map(([locX, locY]) => Object.freeze({ locX, locY, locZ: FLOOR_Z })));

function isInside(locX, locY, locZ) {
    const x = Number(locX), y = Number(locY), z = Number(locZ);
    if (![x, y, z].every(Number.isFinite) || z < MIN_Z || z > MAX_Z) return false;
    let inside = false;
    for (let i = 0, j = POLYGON.length - 1; i < POLYGON.length; j = i++) {
        const [xi, yi] = POLYGON[i], [xj, yj] = POLYGON[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

const isInsideActor = (actor) => isInside(actor?.fetchLocX?.(), actor?.fetchLocY?.(), actor?.fetchLocZ?.());

function distanceToCenter(actor) {
    return Math.hypot(Number(actor?.fetchLocX?.()) - CENTER.locX, Number(actor?.fetchLocY?.()) - CENTER.locY);
}

// count spawn points, spread over the floor, in random order. random is injectable for tests.
function spawnPoints(count, random = Math.random) {
    const pool = [...SPAWNS];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.min(count, pool.length)).map((point) => ({ ...point, head: Math.floor(random() * 65536) }));
}

module.exports = { FLOOR_Z, POLYGON, EXIT, CENTER, SPAWNS, isInside, isInsideActor, distanceToCenter, spawnPoints };
