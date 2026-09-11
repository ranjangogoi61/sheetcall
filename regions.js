```js
/**
 * CALL-E supported regions, generated from the official
 * CALL-E/call-e-integrations README country table.
 *
 * `languages` and `line` are FACTS from that table.
 * `timezone`, `work_days` and `call_window_local` are EDITABLE DEFAULTS
 * chosen by this app - conventions, not facts about any recipient.
 */

const REGIONS = {
  AE: { country: "United Arab Emirates", languages: ["English", "Arabic"], line: "Local", timezone: "Asia/Dubai", work_days: [0, 1, 2, 3, 4], call_window_local: ["09:00", "18:00"] },
  AU: { country: "Australia", languages: ["English"], line: "Local", timezone: "Australia/Sydney", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  BD: { country: "Bangladesh", languages: ["Bengali", "English"], line: "International", timezone: "Asia/Dhaka", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  BR: { country: "Brazil", languages: ["Portuguese", "English"], line: "Local", timezone: "America/Sao_Paulo", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  BW: { country: "Botswana", languages: ["English"], line: "International", timezone: "Africa/Gaborone", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  CA: { country: "Canada", languages: ["English"], line: "International", timezone: "America/Toronto", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  CM: { country: "Cameroon", languages: ["English", "French"], line: "International", timezone: "Africa/Douala", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  DE: { country: "Germany", languages: ["English", "German"], line: "International", timezone: "Europe/Berlin", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  EG: { country: "Egypt", languages: ["English", "Arabic"], line: "International", timezone: "Africa/Cairo", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  ES: { country: "Spain", languages: ["English", "Spanish"], line: "International", timezone: "Europe/Madrid", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  FI: { country: "Finland", languages: ["English", "Finnish"], line: "International", timezone: "Europe/Helsinki", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  FR: { country: "France", languages: ["French", "English"], line: "International", timezone: "Europe/Paris", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  GB: { country: "United Kingdom of Great Britain and Northern Ireland", languages: ["English"], line: "International", timezone: "Europe/London", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  GH: { country: "Ghana", languages: ["English"], line: "International", timezone: "Africa/Accra", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  HN: { country: "Honduras", languages: ["English", "Spanish"], line: "International", timezone: "America/Tegucigalpa", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  ID: { country: "Indonesia", languages: ["English"], line: "International", timezone: "Asia/Jakarta", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  IE: { country: "Ireland", languages: ["English"], line: "International", timezone: "Europe/Dublin", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  IL: { country: "Israel", languages: ["English", "Hebrew"], line: "International", timezone: "Asia/Jerusalem", work_days: [0, 1, 2, 3, 4], call_window_local: ["09:00", "18:00"] },
  IN: { country: "India", languages: ["English", "Hindi", "Tamil"], line: "International", timezone: "Asia/Kolkata", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  JP: { country: "Japan", languages: ["Japanese", "English"], line: "International", timezone: "Asia/Tokyo", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  KE: { country: "Kenya", languages: ["English"], line: "International", timezone: "Africa/Nairobi", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  LK: { country: "Sri Lanka", languages: ["English", "Tamil", "Sinhala"], line: "International", timezone: "Asia/Colombo", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  MX: { country: "Mexico", languages: ["Spanish", "English"], line: "Local", timezone: "America/Mexico_City", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  MY: { country: "Malaysia", languages: ["English", "Chinese", "Malay"], line: "Local", timezone: "Asia/Kuala_Lumpur", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  MZ: { country: "Mozambique", languages: ["English", "Portuguese"], line: "International", timezone: "Africa/Maputo", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  NA: { country: "Namibia", languages: ["English"], line: "International", timezone: "Africa/Windhoek", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  NG: { country: "Nigeria", languages: ["English"], line: "International", timezone: "Africa/Lagos", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  NL: { country: "Netherlands", languages: ["English"], line: "International", timezone: "Europe/Amsterdam", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  OM: { country: "Oman", languages: ["English", "Arabic"], line: "International", timezone: "Asia/Muscat", work_days: [0, 1, 2, 3, 4], call_window_local: ["09:00", "18:00"] },
  PH: { country: "Philippines", languages: ["English"], line: "International", timezone: "Asia/Manila", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  PK: { country: "Pakistan", languages: ["English", "Urdu"], line: "International", timezone: "Asia/Karachi", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  PL: { country: "Poland", languages: ["Polish", "English"], line: "International", timezone: "Europe/Warsaw", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  SA: { country: "Saudi Arabia", languages: ["English", "Arabic"], line: "International", timezone: "Asia/Riyadh", work_days: [0, 1, 2, 3, 4], call_window_local: ["09:00", "18:00"] },
  SG: { country: "Singapore", languages: ["English"], line: "Local", timezone: "Asia/Singapore", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  TH: { country: "Thailand", languages: ["English", "Thai"], line: "International", timezone: "Asia/Bangkok", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  TN: { country: "Tunisia", languages: ["English"], line: "International", timezone: "Africa/Tunis", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  TR: { country: "Turkey", languages: ["Turkish"], line: "International", timezone: "Europe/Istanbul", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  TW: { country: "Taiwan", languages: ["English"], line: "International", timezone: "Asia/Taipei", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  UA: { country: "Ukraine", languages: ["English", "Ukrainian"], line: "International", timezone: "Europe/Kyiv", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  US: { country: "United States of America", languages: ["English"], line: "Local", timezone: "America/New_York", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  VN: { country: "Viet Nam", languages: ["Vietnamese", "English"], line: "International", timezone: "Asia/Ho_Chi_Minh", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] },
  ZA: { country: "South Africa", languages: ["English"], line: "International", timezone: "Africa/Johannesburg", work_days: [1, 2, 3, 4, 5], call_window_local: ["09:00", "18:00"] }
};

module.exports = { REGIONS };
```
