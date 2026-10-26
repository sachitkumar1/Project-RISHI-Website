// Builds the heavy landscape data off the main thread, so the page stays
// fully scrollable while the scene is prepared. Buffers are transferred
// (not copied) back to the page.
import { buildSheet, placePines, placeHouses, placeMist } from "./terrain";

self.onmessage = (e: MessageEvent<{ small: boolean }>) => {
  const small = e.data.small;
  const main = buildSheet(0, -900, 3400, 3400, small ? 170 : 280, 3);
  const village = buildSheet(30, -270, 560, 560, small ? 150 : 230, 0);
  const { pines, shade } = placePines(small ? 700 : 1800);
  const houses = placeHouses(small ? 34 : 56);
  const mist = placeMist(small ? 26 : 46);
  (self as unknown as Worker).postMessage(
    { main, village, pines, shade, houses, mist },
    [main.heights.buffer, main.colors.buffer, village.heights.buffer, village.colors.buffer, pines.buffer, shade.buffer, houses.buffer, mist.buffer],
  );
};
