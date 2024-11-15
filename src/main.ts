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

interface Coin {
  originI: number;
  originJ: number;
  serial: number;
}

// Calculate global coordinates anchored at Null Island (0°N, 0°E)
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

// Update status
function updateStatus() {
  statusPanel.innerHTML =
    `Points: ${playerPoints}, Coins: ${playerCoins.length}`;
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

  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");

    // Function to refresh the popup content dynamically
    function updatePopupContent() {
      popupDiv.innerHTML = `
        <div>Cache at "${i}:${j}" - Points: <span id="value">${cell.pointValue}</span>, Coins: <span id="coins">${cell.coins.length}</span></div>
        <ul id="coinList">${
        cell.coins
          .map((coin) =>
            `<li>Coin: ${coin.originI}:${coin.originJ}#${coin.serial}</li>`
          )
          .join("")
      }</ul>
        <button id="collect">Collect Coins</button>
        <button id="deposit">Deposit Coins</button>
      `;

      popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
        "click",
        () => {
          if (cell.coins.length > 0) {
            playerCoins.push(...cell.coins); // Move all coins to player
            playerPoints += cell.pointValue;
            cell.coins = []; // Clear coins in cache
            cell.pointValue = 0; // Reset point value
            updateStatus();
            updatePopupContent(); // Refresh popup to show updated values
          }
        },
      );

      popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
        "click",
        () => {
          if (playerCoins.length > 0) {
            cell.coins.push(...playerCoins); // Move all player coins to cache
            playerCoins = []; // Clear player coins
            updateStatus();
            updatePopupContent(); // Refresh popup to show updated values
          }
        },
      );
    }

    updatePopupContent(); // Initialize popup content
    return popupDiv;
  });
}

// Spawn caches in the player's neighborhood
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
