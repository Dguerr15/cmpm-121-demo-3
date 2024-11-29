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

// Coin interface
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
  saveState(cacheCells: Map<string, Cache>): void;
  restoreState(): Map<string, Cache>;
}

function createCacheMemento(): cacheMemento {
  let savedState = new Map<string, Cache>();
  return {
    saveState(cacheCells) {
      savedState = new Map(cacheCells);
    },
    restoreState() {
      return new Map(savedState);
    },
  };
}

// Create a memento instance
const cacheMemento = createCacheMemento();

function saveCacheState() {
  cacheMemento.saveState(cacheCells);
}

function restoreCacheState() {
  const restoredState = cacheMemento.restoreState();
  cacheCells.clear();
  for (const [key, restoredCache] of restoredState.entries()) {
    if (!cacheCells.has(key)) {
      cacheCells.set(key, restoredCache);
    }
  }
}

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

let playerLocation = { lat: OAKES_CLASSROOM.lat, lng: OAKES_CLASSROOM.lng };
let playerPoints = 0;
let playerCoins: Coin[] = [];
let autoUpdatePosition = false;
let geoWatchId: number | null = null;
let movementHistory: leaflet.LatLng[] = [OAKES_CLASSROOM];

const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
updateStatus();

// Polyline for movement history
let pathPolyline: leaflet.Polyline;
function updatePlayerPath() {
  if (pathPolyline) {
    pathPolyline.setLatLngs(movementHistory);
  } else {
    pathPolyline = leaflet.polyline(movementHistory, { color: "blue" }).addTo(
      map,
    );
  }
}

// Geolocation button
const geoButton = document.getElementById("geoButton")!;
geoButton.addEventListener("click", () => {
  autoUpdatePosition = !autoUpdatePosition;
  if (autoUpdatePosition) {
    geoButton.textContent = "Stop Geolocation";
    startGeoTracking();
  } else {
    geoButton.textContent = "Start Geolocation";
    stopGeoTracking();
  }
});

function startGeoTracking() {
  if (navigator.geolocation) {
    geoWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        playerLocation.lat = latitude;
        playerLocation.lng = longitude;
        playerMarker.setLatLng(playerLocation);
        const newPosition = leaflet.latLng(latitude, longitude);
        movementHistory.push(newPosition);

        updateStatus();
        updatePlayerPath();
        regenerateCaches();

        // Center map on the new location
        map.setView(playerLocation, GAMEPLAY_ZOOM_LEVEL);
      },
      (error) => console.error(error),
      { enableHighAccuracy: true },
    );
  }
}

function stopGeoTracking() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null; // Reset the watch ID when stopping
  }
}

// Reset button
const resetButton = document.getElementById("resetButton")!;
resetButton.addEventListener("click", () => {
  const confirmReset = prompt(
    "Are you sure you want to reset the game state? This will erase all coins and location history.",
    "Yes",
  );
  if (confirmReset && confirmReset.toLowerCase() === "yes") {
    localStorage.removeItem("gameState");
    location.reload();
  }
});

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
        .map(
          (coin) =>
            `<li><span class="coin" data-coordinates="${cellKey}">${coin.originI}:${coin.originJ}#${coin.serial}</span></li>`,
        )
        .join("")
    }</ul>
      <button id="collect-${cellKey}">Collect Coins</button>
      <button id="deposit-${cellKey}">Deposit Coins</button>
    `;
  }

  // Event listener for clicking a coin
  popupDiv.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("coin")) {
      const [i, j] = target.dataset.coordinates!.split(":").map(Number);
      centerOnCache(i, j);
    }
  });

  // Handle coin collection and deposit actions
  function handleCollectCoins() {
    if (cell.coins.length > 0) {
      playerCoins.push(...cell.coins); // Move all coins to player
      playerPoints += cell.pointValue;
      cell.coins = []; // Clear coins in cache
      cell.pointValue = 0; // Reset point value
      updatePopupContent();
      updateStatus();
      saveGameState();
    }
  }

  function handleDepositCoins() {
    if (playerCoins.length > 0) {
      cell.coins.push(...playerCoins); // Move all player coins to cache
      playerCoins = []; // Clear player coins
      updatePopupContent();
      updateStatus();
      saveGameState();
    }
  }

  // Attach event listeners
  popupDiv.addEventListener("click", (event) => {
    const targetId = (event.target as HTMLElement).id;
    if (targetId === `collect-${cellKey}`) handleCollectCoins();
    if (targetId === `deposit-${cellKey}`) handleDepositCoins();
  });

  updatePopupContent();
  return popupDiv;
}

function centerOnCache(i: number, j: number) {
  const lat = i * TILE_DEGREES;
  const lng = j * TILE_DEGREES;
  map.setView(leaflet.latLng(lat, lng), GAMEPLAY_ZOOM_LEVEL);
}

function spawnCache(globalI: number, globalJ: number) {
  const cellKey = `${globalI}:${globalJ}`;

  if (!cacheCells.has(cellKey)) {
    // Generate new cache data
    const cacheCoins = Math.floor(
      luck([globalI, globalJ, "coins"].toString()) * 10 + 1,
    );
    const pointValue = Math.floor(
      luck([globalI, globalJ, "initialValue"].toString()) * 10 + 1,
    );

    const coins = Array.from({ length: cacheCoins }, (_, index) => ({
      originI: globalI,
      originJ: globalJ,
      serial: index,
    }));
    cacheCells.set(cellKey, { coins, pointValue });
  }

  // Cache exists; fetch it
  const cell = cacheCells.get(cellKey)!;

  // Convert global coordinates back to latitude/longitude
  const cellLat = globalI * TILE_DEGREES;
  const cellLng = globalJ * TILE_DEGREES;
  const bounds = leaflet.latLngBounds([
    [cellLat, cellLng],
    [cellLat + TILE_DEGREES, cellLng + TILE_DEGREES],
  ]);

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);
  rect.bindPopup(() => createCachePopup(cell, cellKey));
}

// Movement and cache managment
function movePlayer(latOffset: number, lngOffset: number) {
  // Stop geolocation tracking if active
  if (autoUpdatePosition!) {
    geoButton.textContent = "Start Geolocation";
    autoUpdatePosition = false;
    stopGeoTracking();
  }

  // Update player location
  const newLat = playerLocation.lat + latOffset;
  const newLng = playerLocation.lng + lngOffset;

  playerLocation = { lat: newLat, lng: newLng };
  movementHistory.push(leaflet.latLng(newLat, newLng));

  // Update the player marker and path
  playerMarker.setLatLng(playerLocation);
  updatePlayerPath();

  // Center map on the new location
  map.setView(playerLocation, GAMEPLAY_ZOOM_LEVEL);
  regenerateCaches();
  saveGameState();
}

function regenerateCaches() {
  const { i: centerI, j: centerJ } = toGlobalCoords(
    playerLocation.lat,
    playerLocation.lng,
  );

  // Restore cache state
  console.log("Cache state before restore:", cacheCells);
  restoreCacheState();
  console.log("Cache state after restore:", cacheCells);

  // Remove all visible rectangles but keep the data
  map.eachLayer((layer: leaflet.Layer) => {
    if (layer instanceof leaflet.Rectangle) {
      map.removeLayer(layer);
    }
  });

  // Generate caches around the player's current position, based on the original seed (globalI, globalJ)
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
      const globalI = centerI + latOffset;
      const globalJ = centerJ + lngOffset;
      const cellKey = `${globalI}:${globalJ}`;

      // Only create or display the cache if it hasn't been generated yet for this position
      if (!cacheCells.has(cellKey)) {
        // Spawn the cache only once based on the seed
        if (
          luck([globalI, globalJ, "seed"].toString()) < CACHE_SPAWN_PROBABILITY
        ) {
          spawnCache(globalI, globalJ);
        }
      } else {
        // Add the existing cache's visual representation if it already exists
        spawnCache(globalI, globalJ);
      }
    }
  }

  // Save cache state
  saveCacheState();
}

// Save game state locally
function saveGameState() {
  const gameState = {
    playerLocation: playerLocation,
    playerPoints: playerPoints,
    playerCoins: playerCoins,
    movementHistory: movementHistory,
    cacheCells: Array.from(cacheCells.entries()).map(([key, value]) => [
      key,
      {
        ...value,
        coins: value.coins.map((coin) => ({ ...coin })), // Create a deep copy of the coins array
      },
    ]),
  };

  // Call saveCacheState to ensure cache state is saved
  saveCacheState();

  localStorage.setItem("gameState", JSON.stringify(gameState));
  console.log("Game state saved:", gameState);
}

// Load game state from localStorage
function loadGameState() {
  const savedState = localStorage.getItem("gameState");
  if (savedState) {
    const gameState = JSON.parse(savedState);

    playerLocation = gameState.playerLocation;
    playerPoints = gameState.playerPoints;
    playerCoins = gameState.playerCoins;
    movementHistory = gameState.movementHistory;
    cacheCells = new Map(gameState.cacheCells);

    /*// Load cacheCells and ensure coins are deep copied if necessary
    cacheCells = new Map(
      gameState.cacheCells.map(([key, value]: [string, any]) => [
        key,
        {
          ...value,
          coins: value.coins ? value.coins.map((coin: any) => ({ ...coin })) : []
        }
      ])
    );
    */

    // Update player marker and other UI
    playerMarker.setLatLng(playerLocation);
    map.setView(playerLocation, GAMEPLAY_ZOOM_LEVEL);
    updateStatus();
    updatePlayerPath();
    regenerateCaches();
  }
}

// Movement Controls
document.getElementById("moveUp")?.addEventListener(
  "click",
  () => movePlayer(TILE_DEGREES, 0),
);
document.getElementById("moveDown")?.addEventListener(
  "click",
  () => movePlayer(-TILE_DEGREES, 0),
);
document.getElementById("moveLeft")?.addEventListener(
  "click",
  () => movePlayer(0, -TILE_DEGREES),
);
document.getElementById("moveRight")?.addEventListener(
  "click",
  () => movePlayer(0, TILE_DEGREES),
);

// Button interaction for alert example
document.getElementById("exampleButton")?.addEventListener("click", () => {
  alert("You clicked me!");
});

// Flyweight example for reusing objects
console.log("Flyweight caches active:");
console.log(cacheCells);

// Debug: Log current state when a key is pressed
document.addEventListener("keydown", (event) => {
  if (event.key === "s") {
    console.log("Saving cache state...");
    saveGameState();
  } else if (event.key === "r") {
    console.log("Restoring cache state...");
    regenerateCaches();
    loadGameState();
  } else if (event.key === "p") {
    console.log("Player Info:", {
      location: playerLocation,
      points: playerPoints,
      coins: playerCoins,
    });
  }
});

// Map interaction example for debugging
map.on("click", (event: leaflet.MouseEvent) => {
  const { lat, lng } = event.latlng;
  const { i, j } = toGlobalCoords(lat, lng);
  const cellKey = `${i}:${j}`;
  console.log(`Map clicked at ${cellKey}`);
});

// Ensruing correct build on initiliazation
globalThis.onload = () => {
  initiliazeMap();
};

function initiliazeMap() {
  const savedState = localStorage.getItem("gameState");
  if (savedState) {
    loadGameState();
  } else {
    regenerateCaches();
  }
}
