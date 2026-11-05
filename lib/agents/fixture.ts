import "server-only";

import type { ScoutingRepo } from "./store";
import type { Channel, Scout, ScoutingSettings, Tip } from "./types";

/**
 * Scouting im lokalen Testmodus (RADAR_FIXTURES=1): Startkader und Startquellen wie in Migration 0007,
 * Zustand im Speicher des Server-Prozesses. Läufe gibt es hier nicht (kein API-Schlüssel, keine Datenbank).
 */
interface Store {
  settings: ScoutingSettings;
  scouts: Scout[];
  channels: Channel[];
  tips: Tip[];
}

const g = globalThis as unknown as { __trendradarScouting?: Store };

const ch = (key: string, name: string, kind: Channel["kind"], url: string | null, domains: string[], verticals: Channel["verticals"], region: Channel["region"], access: Channel["access"], active: boolean, notes: string | null = null): Channel => ({
  id: `ch-${key}`, key, name, kind, url, domains, verticals, region, language: region === "DACH" ? "de" : region === "GLOBAL" ? null : "en", access, secretRef: null, notes, active, verified: false,
});

function init(): Store {
  const channels: Channel[] = [
    ch("websuche", "Websuche", "web_search", null, [], ["SPORT", "HOSPITALITY", "LIVE"], "GLOBAL", "open", true, "Eingebaute Websuche. Pro Scout mit Revier, Stichwörtern und Domains eingegrenzt."),
    ch("linkedin", "LinkedIn", "linkedin", "https://www.linkedin.com", ["linkedin.com"], ["SPORT", "HOSPITALITY", "LIVE"], "GLOBAL", "open", true, "Keine fremden Beiträge über die Schnittstelle; öffentliche Artikel über die Websuche und eingereichte Tipps."),
    ch("stadionwelt", "Stadionwelt", "website", "https://www.stadionwelt.de", ["stadionwelt.de"], ["SPORT", "LIVE"], "DACH", "open", true, "Teile der Inhalte nur für Mitglieder."),
    ch("sponsors", "SPONSORs", "website", "https://www.sponsors.de", ["sponsors.de"], ["SPORT"], "DACH", "subscription", true),
    ch("sportbusiness", "SportBusiness", "website", "https://www.sportbusiness.com", ["sportbusiness.com"], ["SPORT"], "GLOBAL", "subscription", true),
    ch("sportspro", "SportsPro", "website", "https://www.sportspromedia.com", ["sportspromedia.com"], ["SPORT"], "GLOBAL", "open", true),
    ch("panstadia", "Panstadia & Arena Management", "website", "https://www.panstadia.com", ["panstadia.com"], ["SPORT", "LIVE"], "GLOBAL", "open", true),
    ch("ahgz", "AHGZ", "website", "https://www.ahgz.de", ["ahgz.de"], ["HOSPITALITY"], "DACH", "subscription", true),
    ch("tophotel", "Tophotel", "website", "https://www.tophotel.de", ["tophotel.de"], ["HOSPITALITY"], "DACH", "open", true),
    ch("hospitalityinside", "hospitalityInside", "website", "https://www.hospitalityinside.com", ["hospitalityinside.com"], ["HOSPITALITY"], "EU", "subscription", true),
    ch("iq", "IQ Magazine", "website", "https://www.iq-mag.net", ["iq-mag.net"], ["LIVE"], "GLOBAL", "open", true),
    ch("pollstar", "Pollstar", "website", "https://www.pollstar.com", ["pollstar.com"], ["LIVE"], "US", "subscription", true),
    ch("sbj", "Sports Business Journal", "website", "https://www.sportsbusinessjournal.com", ["sportsbusinessjournal.com"], ["SPORT"], "US", "subscription", true),
  ];
  const sc = (key: string, name: string, role: string, shirtNumber: number, briefing: string, keywords: string[], verticals: Scout["verticals"], clusters: string[], journeyStages: string[], audience: Scout["audience"], regions: Scout["regions"], extra: string[]): Scout => ({
    id: `sc-${key}`, key, name, role, shirtNumber, briefing, keywords, exclusions: [], verticals, clusters, journeyStages, audience, regions,
    languages: regions.includes("US") && regions.length === 1 ? ["en"] : ["de", "en"], watchTrends: [], cadence: "daily", runHour: 5, runWeekday: null,
    maxSearches: 12, maxCostUsd: 2, maxSignals: 8, deliverMedia: true, minEvidence: "B", model: "claude-opus-5-5", effort: "medium", active: false, lastRunAt: null,
    channelIds: ["ch-websuche", "ch-linkedin", ...extra.map((k) => `ch-${k}`)],
  });
  const scouts: Scout[] = [
    sc("safety", "Regulierung & Sicherheit", "Scout Recht · Safety · Inklusion", 5, "EU AI Act, DSGVO, Sicherheits- und Crowd-Management, Barrierefreiheit und Inklusion bei Veranstaltungen.", ["EU AI Act", "DSGVO", "Crowd-Management", "Barrierefreiheit"], ["SPORT", "LIVE"], ["G"], ["einlass", "stadion"], "both", ["DACH", "EU"], ["stadionwelt"]),
    sc("venue", "Venue & Infrastruktur", "Scout Bau · Energie · Mobilität", 4, "Stadionbau und -modernisierung, Energie und Speicher, Mobilität, Parken und Laden, Konnektivität.", ["Stadionbau", "Batteriespeicher", "Parken", "E-Laden", "5G"], ["SPORT", "LIVE"], ["D", "F"], ["anreise", "kulissen"], "both", ["DACH", "EU"], ["stadionwelt", "panstadia"]),
    sc("fnb", "Food & Beverage", "Scout Kiosk · Zapftechnik · Pfand", 6, "Kassensysteme, Mobile Ordering, Zapftechnik, Self-Pour, Pfand- und Mehrwegsysteme, Küchenautomatisierung in Stadien und Arenen.", ["Kassensystem", "Mobile Order", "Zapfanlage", "Pfand", "Mehrweg"], ["SPORT", "LIVE", "HOSPITALITY"], ["B", "D", "F"], ["stadion"], "public", ["DACH", "EU", "US"], ["stadionwelt", "ahgz", "panstadia"]),
    sc("matchday", "Matchday & Fan Tech", "Scout Sport · Fan Experience", 7, "Neue Lösungen und Piloten rund um Ticketing, Club-Apps, Personalisierung, Second Screen und Fan-Bindung.", ["Ticketing", "Club-App", "Fan Engagement", "Loyalty"], ["SPORT"], ["A", "C"], ["zuhause", "einlass"], "public", ["DACH", "EU"], ["stadionwelt", "sponsors", "sportspro"]),
    sc("live", "Live Entertainment", "Scout Arenen · Konzerte · Festivals", 8, "Entwicklungen in Arenen, Konzert- und Festivalbetrieb: Besucherführung, Gastronomie, Multi-Use, Technik.", ["Arena", "Konzert", "Festival", "Multi-Use"], ["LIVE"], ["A", "D", "E"], ["stadion", "region"], "both", ["DACH", "EU", "US"], ["stadionwelt", "iq", "pollstar", "panstadia"]),
    sc("hospitality", "Hospitality & VIP", "Scout Hospitality · Premium", 10, "Premium-Angebote, Logen, Business Seats, Event-Tourismus und Hotel-Kooperationen rund um Spiele und Events.", ["Hospitality", "VIP", "Loge", "Event-Tourismus"], ["SPORT", "HOSPITALITY", "LIVE"], ["C"], ["region", "stadion"], "vip", ["DACH", "EU"], ["ahgz", "tophotel", "hospitalityinside", "sponsors"]),
    sc("us", "US-Vorreiter", "Scout USA · frühe Signale", 11, "Frühe Signale aus US-Ligen, Arenen und Hospitality, mit Einschätzung, was davon nach Europa kommen kann.", ["NFL", "NBA", "MLS", "Arena"], ["SPORT", "LIVE", "HOSPITALITY"], [], [], "both", ["US"], ["sbj", "pollstar", "sportspro"]),
  ];
  return { settings: { monthlyBudgetUsd: 200, paused: false }, scouts, channels, tips: [] };
}

const store = () => (g.__trendradarScouting ??= init());

export function fixtureScouting(): ScoutingRepo {
  return {
    async settings() { return { ...store().settings }; },
    async saveSettings(s) { store().settings = { ...s }; },
    async scouts() { return structuredClone(store().scouts); },
    async saveScout(id, s) {
      const st = store();
      if (id) {
        const i = st.scouts.findIndex((x) => x.id === id);
        if (i < 0) throw new Error("Scout nicht gefunden.");
        st.scouts[i] = { ...st.scouts[i], ...structuredClone(s) };
        return id;
      }
      const nid = `sc-neu-${st.scouts.length + 1}`;
      st.scouts.push({ ...structuredClone(s), id: nid, key: null, lastRunAt: null });
      return nid;
    },
    async channels() { return structuredClone(store().channels); },
    async saveChannel(id, c) {
      const st = store();
      if (id) {
        const i = st.channels.findIndex((x) => x.id === id);
        if (i < 0) throw new Error("Quelle nicht gefunden.");
        st.channels[i] = { ...st.channels[i], ...structuredClone(c) };
        return id;
      }
      const nid = `ch-neu-${st.channels.length + 1}`;
      st.channels.push({ ...structuredClone(c), id: nid, key: null });
      return nid;
    },
    async tips() { return structuredClone(store().tips); },
    async addTip(url, note, scoutId) {
      store().tips.unshift({ id: `tip-${Date.now()}`, url, note, scoutId, status: "open", signalId: null, error: null, createdAt: new Date().toISOString(), processedAt: null });
    },
    async monthSpendUsd() { return 0; },
    async runStats() { return {}; },
  };
}
