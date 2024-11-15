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

// Calculate global coordinates anchored at Null Island (0N, 0E)
function toGlobalCoords(lat: number, lng: number) {
  return {
    i: Math.floor(lat / TILE_DEGREES),
    j: Math.floor(lng / TILE_DEGREES),
  };
}

// Flyweight pattern: cache objects keyed by their global coordinates
const cacheCells = new Map<string, { coins: Coin[]; pointValue: number }>();

// Player setup
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

const playerMarker = leaflet.marker(OAKES_CLASSROOM).bindTooltip("That's you!");
playerMarker.addTo(map);

let playerPoints = 0;
let playerCoins: Coin[] = [];
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = `Points: ${playerPoints}, Coins: ${playerCoins.length}`;

// Update status and UI
function updateStatus() {
  statusPanel.innerHTML =
    `Points: ${playerPoints}, Coins: ${playerCoins.length}`;
}
// Handle coin collection and deposit actions
function handleCollectCoins(cell: { coins: Coin[]; pointValue: number }) {
  if (cell.coins.length > 0) {
    playerCoins.push(...cell.coins); // Move all coins to player
    playerPoints += cell.pointValue;
    cell.coins = []; // Clear coins in cache
    cell.pointValue = 0; // Reset point value
    updateStatus();
  }
}

function handleDepositCoins(cell: { coins: Coin[] }) {
  if (playerCoins.length > 0) {
    cell.coins.push(...playerCoins); // Move all player coins to cache
    playerCoins = []; // Clear player coins
    updateStatus();
  }
}

// Create cache popup content
function createCachePopup(
  i: number,
  j: number,
  cell: { coins: Coin[]; pointValue: number },
) {
  const popupDiv = document.createElement("div");

  popupDiv.innerHTML = `
    <div>Cache at "${i}:${j}" - Points: <span id="value">${cell.pointValue}</span>, Coins: <span id="coins">${cell.coins.length}</span></div>
    <ul id="coinList">${
    cell.coins.map((coin) =>
      `<li>Coin: ${coin.originI}:${coin.originJ}#${coin.serial}</li>`
    ).join("")
  }</ul>
    <button id="collect">Collect Coins</button>
    <button id="deposit">Deposit Coins</button>
  `;

  popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
    "click",
    () => handleCollectCoins(cell),
  );
  popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
    "click",
    () => handleDepositCoins(cell),
  );

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

  rect.bindPopup(() => createCachePopup(i, j, cell));
}

// Spawn caches in the player's neighborhood
function spawnNeighborhoodCaches() {
  for (
    let latOffset = -NEIGHBORHOOD_SIZE;
    latOffset < NEIGHBORHOOD_SIZE;
    latOffset++
  ) {
    for (
      let lngOffset = -NEIGHBORHOOD_SIZE;
      lngOffset < NEIGHBORHOOD_SIZE;
      lngOffset++
    ) {
      if (luck([latOffset, lngOffset].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(latOffset, lngOffset);
      }
    }
  }
}

// Initialize neighborhood caches
spawnNeighborhoodCaches();
