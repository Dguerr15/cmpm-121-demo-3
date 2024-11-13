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

// Player's initial location and setup
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

// Player's marker
const playerMarker = leaflet.marker(OAKES_CLASSROOM).bindTooltip("That's you!");
playerMarker.addTo(map);

// Player status and coins
let playerPoints = 0;
let playerCoins = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = `Points: ${playerPoints}, Coins: ${playerCoins}`;

// Spawn cache function with collect/deposit functionality
function spawnCache(i: number, j: number) {
  const origin = OAKES_CLASSROOM;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // Deterministic number of coins
  let cacheCoins = Math.floor(luck([i, j, "coins"].toString()) * 10 + 1);
  let pointValue = Math.floor(luck([i, j, "initialValue"].toString()) * 10 + 1);

  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
        <div>Cache at "${i},${j}" - Points: <span id="value">${pointValue}</span>, Coins: <span id="coins">${cacheCoins}</span></div>
        <button id="collect">Collect Coins</button>
        <button id="deposit">Deposit Coins</button>
      `;

    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      () => {
        // Collect coins if available
        if (cacheCoins > 0) {
          playerCoins += cacheCoins;
          playerPoints += pointValue;
          pointValue = 0;
          cacheCoins = 0;
          popupDiv.querySelector<HTMLSpanElement>("#coins")!.innerHTML =
            cacheCoins.toString();
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            pointValue.toString();
          updateStatus();
        }
      },
    );

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        // Deposit coins if the player has any
        if (playerCoins > 0) {
          cacheCoins += playerCoins;
          playerCoins = 0;
          popupDiv.querySelector<HTMLSpanElement>("#coins")!.innerHTML =
            cacheCoins.toString();
          updateStatus();
        }
      },
    );

    return popupDiv;
  });
}

// Update status panel
function updateStatus() {
  statusPanel.innerHTML = `Points: ${playerPoints}, Coins: ${playerCoins}`;
}

// Spawn caches around the player
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}
