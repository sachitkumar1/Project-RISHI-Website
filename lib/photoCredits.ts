// Landscape photographs used as backdrops on the public site, and their
// credits. Photos by others are used under their Creative Commons licences;
// we colour-grade and crop them (scripts/landscape/prepare_photos.py), which
// the CC BY-SA licence asks us to say. These are views of villages elsewhere
// in Himachal Pradesh, used for atmosphere — not photos of Bharog Baneri, and
// never captioned as such. Swap in the team's own photos whenever they exist.
// Shown on /credits (app/credits/page.tsx), linked from the footer.

export type PhotoCredit = {
  place: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
};

const BY_SA = { license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" };
const GONSALVES = "Timothy A. Gonsalves";

export const PHOTO_CREDITS: Record<string, PhotoCredit> = {
  valley: { place: "Navlay valley, Mandi district", author: GONSALVES, ...BY_SA, source: "https://commons.wikimedia.org/wiki/File:Navlay_Valley_Wheat_Himachal_Mar19_D72_10022.jpg" },
  terraces: { place: "Kundakh, Mandi district", author: GONSALVES, ...BY_SA, source: "https://commons.wikimedia.org/wiki/File:Houses_Fields_Kundakh_Mandi_Mar26_A7CR_10628.jpg" },
  village: { place: "Suni Sher, Mandi district", author: GONSALVES, ...BY_SA, source: "https://commons.wikimedia.org/wiki/File:Houses_Fields_Suni_Sher_Close_Mandi_Mar26_A7CR_10630.jpg" },
  hamlet: { place: "Kataula, Mandi district", author: GONSALVES, ...BY_SA, source: "https://commons.wikimedia.org/wiki/File:Hamlet_North_Kataula_Mandi_Mar26_A7CR_10596.jpg" },
  fields: { place: "Kundakh, Mandi district", author: GONSALVES, ...BY_SA, source: "https://commons.wikimedia.org/wiki/File:Houses_Fields_Kundakh_Mandi_Mar26_A7CR_10623.jpg" },
  hillside: { place: "Kundakh, Mandi district", author: GONSALVES, ...BY_SA, source: "https://commons.wikimedia.org/wiki/File:Houses_Fields_Mountains_Kundakh_Mandi_Mar26_A7CR_10624.jpg" },
  slopes: { place: "Suni Sher, Mandi district", author: GONSALVES, ...BY_SA, source: "https://commons.wikimedia.org/wiki/File:Houses_Fields_Suni_Sher_Mandi_Mar26_A7CR_10631.jpg" },
  deodars: { place: "Deodar forest at Bindeshwar Mahadev", author: "Rohit Gosain", ...BY_SA, source: "https://commons.wikimedia.org/wiki/File:Deodar_forest_at_Bindeshwar_Mahadev.jpg" },
  dhauladhar: { place: "The Dhauladhar range from Shali Mata temple", author: "502hsuya", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", source: "https://commons.wikimedia.org/wiki/File:Dhauladhar_views_from_Shali_Mata_Temple.jpg" },
  snowline: { place: "The Dhauladhar range", author: "Gayatri Priyadarshini", ...BY_SA, source: "https://commons.wikimedia.org/wiki/File:Snow_peaked_dhauladhar_mountain_ranges.jpg" },
};
