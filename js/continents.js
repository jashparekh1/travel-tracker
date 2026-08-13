// US state lists + flag codes. Country data (continents, flags, display
// names) is generated into js/countries-meta.js — don't hand-edit that one.

// The 50 US states (denominator for the "states visited" stat).
// DC and Puerto Rico are on the map and clickable, just not counted here.
window.US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana",
  "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
  "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];
window.US_EXTRAS = ["District of Columbia", "Puerto Rico"];

// Flag image codes (img/flags/<code>.png). "" = no flag available.
window.US_STATE_CODES = {
  "Alabama": "us-al", "Alaska": "us-ak", "Arizona": "us-az", "Arkansas": "us-ar",
  "California": "us-ca", "Colorado": "us-co", "Connecticut": "us-ct",
  "Delaware": "us-de", "Florida": "us-fl", "Georgia": "us-ga", "Hawaii": "us-hi",
  "Idaho": "us-id", "Illinois": "us-il", "Indiana": "us-in", "Iowa": "us-ia",
  "Kansas": "us-ks", "Kentucky": "us-ky", "Louisiana": "us-la", "Maine": "us-me",
  "Maryland": "us-md", "Massachusetts": "us-ma", "Michigan": "us-mi",
  "Minnesota": "us-mn", "Mississippi": "us-ms", "Missouri": "us-mo",
  "Montana": "us-mt", "Nebraska": "us-ne", "Nevada": "us-nv",
  "New Hampshire": "us-nh", "New Jersey": "us-nj", "New Mexico": "us-nm",
  "New York": "us-ny", "North Carolina": "us-nc", "North Dakota": "us-nd",
  "Ohio": "us-oh", "Oklahoma": "us-ok", "Oregon": "us-or",
  "Pennsylvania": "us-pa", "Rhode Island": "us-ri", "South Carolina": "us-sc",
  "South Dakota": "us-sd", "Tennessee": "us-tn", "Texas": "us-tx",
  "Utah": "us-ut", "Vermont": "us-vt", "Virginia": "us-va",
  "Washington": "us-wa", "West Virginia": "us-wv", "Wisconsin": "us-wi",
  "Wyoming": "us-wy", "District of Columbia": "", "Puerto Rico": "pr",
};

// Compact month+year picker (short month names — native month inputs
// show full names and overflow). Returns {value(), clear()} where value
// is "YYYY-MM" or null.
window.myPicker = (el) => {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mSel = document.createElement("select");
  mSel.innerHTML = `<option value="">Month</option>` +
    MONTHS.map((m, i) => `<option value="${String(i + 1).padStart(2, "0")}">${m}</option>`).join("");
  const ySel = document.createElement("select");
  const thisYear = 2030;
  let opts = `<option value="">Year</option>`;
  for (let y = thisYear; y >= 1950; y--) opts += `<option value="${y}">${y}</option>`;
  ySel.innerHTML = opts;
  el.append(mSel, ySel);
  return {
    value: () => (mSel.value && ySel.value ? `${ySel.value}-${mSel.value}` : null),
    clear: () => { mSel.value = ""; ySel.value = ""; },
    set: (v) => {
      if (!v) { mSel.value = ""; ySel.value = ""; return; }
      ySel.value = v.slice(0, 4);
      mSel.value = v.slice(5, 7);
    },
  };
};

// Flag <img> for a country or state name ("" if none available).
window.flagImg = (type, name, cls) => {
  let code = "";
  if (type === "countries") code = (window.COUNTRY_META[name] || [])[1] || "";
  else if (type === "states") code = window.US_STATE_CODES[name] || "";
  return code ? `<img class="${cls || "flag"}" src="img/flags/${code}.png" alt="">` : "";
};
