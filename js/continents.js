// Country -> continent mapping. Keys match properties.name in
// data/countries-110m.json (Natural Earth 110m) exactly — this is the
// single source of truth for the country list everywhere in the app.

window.CONTINENTS = {
  // ---- Africa ----
  "Algeria": "Africa", "Angola": "Africa", "Benin": "Africa", "Botswana": "Africa",
  "Burkina Faso": "Africa", "Burundi": "Africa", "Cameroon": "Africa",
  "Central African Rep.": "Africa", "Chad": "Africa", "Congo": "Africa",
  "Côte d'Ivoire": "Africa", "Dem. Rep. Congo": "Africa", "Djibouti": "Africa",
  "Egypt": "Africa", "Eq. Guinea": "Africa", "Eritrea": "Africa", "Ethiopia": "Africa",
  "Gabon": "Africa", "Gambia": "Africa", "Ghana": "Africa", "Guinea": "Africa",
  "Guinea-Bissau": "Africa", "Kenya": "Africa", "Lesotho": "Africa", "Liberia": "Africa",
  "Libya": "Africa", "Madagascar": "Africa", "Malawi": "Africa", "Mali": "Africa",
  "Mauritania": "Africa", "Morocco": "Africa", "Mozambique": "Africa", "Namibia": "Africa",
  "Niger": "Africa", "Nigeria": "Africa", "Rwanda": "Africa", "S. Sudan": "Africa",
  "Senegal": "Africa", "Sierra Leone": "Africa", "Somalia": "Africa", "Somaliland": "Africa",
  "South Africa": "Africa", "Sudan": "Africa", "Tanzania": "Africa", "Togo": "Africa",
  "Tunisia": "Africa", "Uganda": "Africa", "W. Sahara": "Africa", "Zambia": "Africa",
  "Zimbabwe": "Africa", "eSwatini": "Africa",

  // ---- Asia ----
  "Afghanistan": "Asia", "Armenia": "Asia", "Azerbaijan": "Asia", "Bangladesh": "Asia",
  "Bhutan": "Asia", "Brunei": "Asia", "Cambodia": "Asia", "China": "Asia",
  "Cyprus": "Asia", "N. Cyprus": "Asia", "Georgia": "Asia", "India": "Asia",
  "Indonesia": "Asia", "Iran": "Asia", "Iraq": "Asia", "Israel": "Asia",
  "Japan": "Asia", "Jordan": "Asia", "Kazakhstan": "Asia", "Kuwait": "Asia",
  "Kyrgyzstan": "Asia", "Laos": "Asia", "Lebanon": "Asia", "Malaysia": "Asia",
  "Mongolia": "Asia", "Myanmar": "Asia", "Nepal": "Asia", "North Korea": "Asia",
  "Oman": "Asia", "Pakistan": "Asia", "Palestine": "Asia", "Philippines": "Asia",
  "Qatar": "Asia", "Saudi Arabia": "Asia", "South Korea": "Asia", "Sri Lanka": "Asia",
  "Syria": "Asia", "Taiwan": "Asia", "Tajikistan": "Asia", "Thailand": "Asia",
  "Timor-Leste": "Asia", "Turkey": "Asia", "Turkmenistan": "Asia",
  "United Arab Emirates": "Asia", "Uzbekistan": "Asia", "Vietnam": "Asia", "Yemen": "Asia",

  // ---- Europe ----
  "Albania": "Europe", "Austria": "Europe", "Belarus": "Europe", "Belgium": "Europe",
  "Bosnia and Herz.": "Europe", "Bulgaria": "Europe", "Croatia": "Europe",
  "Czechia": "Europe", "Denmark": "Europe", "Estonia": "Europe", "Finland": "Europe",
  "France": "Europe", "Germany": "Europe", "Greece": "Europe", "Hungary": "Europe",
  "Iceland": "Europe", "Ireland": "Europe", "Italy": "Europe", "Kosovo": "Europe",
  "Latvia": "Europe", "Lithuania": "Europe", "Luxembourg": "Europe",
  "Macedonia": "Europe", "Moldova": "Europe", "Montenegro": "Europe",
  "Netherlands": "Europe", "Norway": "Europe", "Poland": "Europe", "Portugal": "Europe",
  "Romania": "Europe", "Russia": "Europe", "Serbia": "Europe", "Slovakia": "Europe",
  "Slovenia": "Europe", "Spain": "Europe", "Sweden": "Europe", "Switzerland": "Europe",
  "Ukraine": "Europe", "United Kingdom": "Europe",

  // ---- North America ----
  "Bahamas": "North America", "Belize": "North America", "Canada": "North America",
  "Costa Rica": "North America", "Cuba": "North America",
  "Dominican Rep.": "North America", "El Salvador": "North America",
  "Greenland": "North America", "Guatemala": "North America", "Haiti": "North America",
  "Honduras": "North America", "Jamaica": "North America", "Mexico": "North America",
  "Nicaragua": "North America", "Panama": "North America",
  "Puerto Rico": "North America", "Trinidad and Tobago": "North America",
  "United States of America": "North America",

  // ---- South America ----
  "Argentina": "South America", "Bolivia": "South America", "Brazil": "South America",
  "Chile": "South America", "Colombia": "South America", "Ecuador": "South America",
  "Falkland Is.": "South America", "Guyana": "South America",
  "Paraguay": "South America", "Peru": "South America", "Suriname": "South America",
  "Uruguay": "South America", "Venezuela": "South America",

  // ---- Oceania ----
  "Australia": "Oceania", "Fiji": "Oceania", "New Caledonia": "Oceania",
  "New Zealand": "Oceania", "Papua New Guinea": "Oceania",
  "Solomon Is.": "Oceania", "Vanuatu": "Oceania",

  // ---- Antarctica ----
  "Antarctica": "Antarctica", "Fr. S. Antarctic Lands": "Antarctica",
};

// Prettier display names for the abbreviated Natural Earth labels.
window.DISPLAY_NAMES = {
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  "Central African Rep.": "Central African Republic",
  "Dem. Rep. Congo": "DR Congo",
  "Dominican Rep.": "Dominican Republic",
  "Eq. Guinea": "Equatorial Guinea",
  "Falkland Is.": "Falkland Islands",
  "Fr. S. Antarctic Lands": "French Southern Lands",
  "Macedonia": "North Macedonia",
  "N. Cyprus": "Northern Cyprus",
  "S. Sudan": "South Sudan",
  "Solomon Is.": "Solomon Islands",
  "United States of America": "United States",
  "W. Sahara": "Western Sahara",
  "eSwatini": "Eswatini",
};

window.displayName = (name) => window.DISPLAY_NAMES[name] || name;

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
