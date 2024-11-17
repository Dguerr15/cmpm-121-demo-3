import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Coin object type
interface Coin {
  originI: number;
  originJ: number;
  serial: number;
}

// Cache interface
interface Cache {
  coins: Coin[];
  pointValue: number;
}

// Memento pattern, save/restore cache state
interface cacheMemento {
  saveState(
    cacheCells: Map<string, Cache>,
  ): void;
  restoreState(): Map<string, Cache>;
}

function createCacheMemento(): cacheMemento {
  let cacheState = new Map<string, Cache>();
  return {
    saveState(cacheCells) {
      cacheState = new Map(cacheCells);
    },
    restoreState() {
      return cacheState;
    },
  };
}

//initialize memento
const cacheMemento = createCacheMemento();

// Map setup
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// Player setup
const playerMarker = leaflet.marker(OAKES_CLASSROOM).bindTooltip("That's you!");
playerMarker.addTo(map);

const playerLocation = { lat: OAKES_CLASSROOM.lat, lng: OAKES_CLASSROOM.lng };
let playerPoints = 0;
let playerCoins: Coin[] = [];
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
updateStatus();

// Cache and Flyweight pattern
let cacheCells = new Map<string, Cache>();

// Calculate global coordinates anchored at Null Island (0N, 0E)
function toGlobalCoords(lat: number, lng: number) {
  return {
    i: Math.floor(lat / TILE_DEGREES),
    j: Math.floor(lng / TILE_DEGREES),
  };
}

// Update status and UI
function updateStatus() {
  statusPanel.innerHTML =
    `Points: ${playerPoints}, Coins: ${playerCoins.length}`;
}

// Create cache popup content
function createCachePopup(cell: Cache, cellKey: string): HTMLDivElement {
  const popupDiv = document.createElement("div");

  function updatePopupContent() {
    popupDiv.innerHTML = `
      <div>Cache at "${cellKey}"</div>
      <div>Points: <span>${cell.pointValue}</span>, Coins: <span>${cell.coins.length}</span></div>
      <ul>${
      cell.coins
        .map((coin) =>
          `<li>Coin: ${coin.originI}:${coin.originJ}#${coin.serial}</li>`
        )
        .join("")
    }</ul>
      <button id="collect-${cellKey}">Collect Coins</button>
      <button id="deposit-${cellKey}">Deposit Coins</button>
    `;
  }

  // Handle coin collection and deposit actions
  function handleCollectCoins() {
    if (cell.coins.length > 0) {
      playerCoins.push(...cell.coins); // Move all coins to player
      playerPoints += cell.pointValue;
      cell.coins = []; // Clear coins in cache
      cell.pointValue = 0; // Reset point value
      updateStatus();
      updatePopupContent();
    }
  }

  function handleDepositCoins() {
    if (playerCoins.length > 0) {
      cell.coins.push(...playerCoins); // Move all player coins to cache
      playerCoins = []; // Clear player coins
      updateStatus();
      updatePopupContent();
    }
  }

  // Attach event listeners dynamically
  popupDiv.addEventListener("click", (event) => {
    const targetId = (event.target as HTMLElement).id;
    if (targetId === `collect-${cellKey}`) handleCollectCoins();
    if (targetId === `deposit-${cellKey}`) handleDepositCoins();
  });

  updatePopupContent();
  return popupDiv;
}

// Spawn cache with unique coin identities
function spawnCache(latOffset: number, lngOffset: number) {
  const origin = OAKES_CLASSROOM;
  const cellLat = origin.lat + latOffset * TILE_DEGREES;
  const cellLng = origin.lng + lngOffset * TILE_DEGREES;
  const { i, j } = toGlobalCoords(cellLat, cellLng);
  const cellKey = `${i}:${j}`;

  if (!cacheCells.has(cellKey)) {
    const cacheCoins = Math.floor(luck([i, j, "coins"].toString()) * 10 + 1);
    const pointValue = Math.floor(
      luck([i, j, "initialValue"].toString()) * 10 + 1,
    );

    // Assign each coin a unique ID within its origin cache
    const coins = Array.from({ length: cacheCoins }, (_, index) => ({
      originI: i,
      originJ: j,
      serial: index,
    }));
    cacheCells.set(cellKey, { coins, pointValue });
  }

  const cell = cacheCells.get(cellKey)!;
  const bounds = leaflet.latLngBounds([
    [cellLat, cellLng],
    [cellLat + TILE_DEGREES, cellLng + TILE_DEGREES],
  ]);

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  rect.bindPopup(() => createCachePopup(cell, `${i}:${j}`));
}

// Movement and cache managment
function movePlayer(direction: string) {
  const delta = TILE_DEGREES;
  if (direction === "up") playerLocation.lat += delta;
  if (direction === "down") playerLocation.lat -= delta;
  if (direction === "left") playerLocation.lng -= delta;
  if (direction === "right") playerLocation.lng += delta;

  playerMarker.setLatLng(playerLocation);
  regenerateCaches();
}

function regenerateCaches() {
  const savedCacheState = cacheMemento.restoreState();
  cacheCells = savedCacheState;

  // Clear existing rectangles
  map.eachLayer((layer: leaflet.Layer) => {
    if (layer instanceof leaflet.Rectangle) map.removeLayer(layer);
  });

  // Re-add existing caches and spawn new ones
  const { i: centerI, j: centerJ } = toGlobalCoords(
    playerLocation.lat,
    playerLocation.lng,
  );

  for (
    let latOffset = -NEIGHBORHOOD_SIZE;
    latOffset <= NEIGHBORHOOD_SIZE;
    latOffset++
  ) {
    for (
      let lngOffset = -NEIGHBORHOOD_SIZE;
      lngOffset <= NEIGHBORHOOD_SIZE;
      lngOffset++
    ) {
      const cellKey = `${centerI + latOffset}:${centerJ + lngOffset}`;

      if (!cacheCells.has(cellKey)) {
        if (luck([latOffset, lngOffset].toString()) < CACHE_SPAWN_PROBABILITY) {
          spawnCache(latOffset, lngOffset);
        }
      } else {
        // Add existing cache's visual representation
        spawnCache(latOffset, lngOffset);
      }
    }
  }

  cacheMemento.saveState(cacheCells);
}

// Movement Controls
document.getElementById("moveUp")?.addEventListener(
  "click",
  () => movePlayer("up"),
);
document.getElementById("moveDown")?.addEventListener(
  "click",
  () => movePlayer("down"),
);
document.getElementById("moveLeft")?.addEventListener(
  "click",
  () => movePlayer("left"),
);
document.getElementById("moveRight")?.addEventListener(
  "click",
  () => movePlayer("right"),
);

// Initial Cache Spawn
regenerateCaches();
