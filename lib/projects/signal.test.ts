import { describe, expect, it } from "vitest";
import { addWorkdays, projectSignal, workdaysBetween, type SignalInput } from "./signal";

// Freitag, 6. November 2026
const now = new Date("2026-11-06T10:00:00Z");
const base: SignalInput = { status: "shortlist", editorSeenAt: null, milestones: [], lastCustomerAt: null, lastTeamAt: null };

describe("Werktage", () => {
  it("zählt Montag bis Freitag", () => {
    expect(workdaysBetween("2026-11-06", "2026-11-09")).toBe(1); // Fr → Mo
    expect(workdaysBetween("2026-11-02", "2026-11-06")).toBe(4);
    expect(workdaysBetween("2026-11-06", "2026-11-06")).toBe(0);
    expect(workdaysBetween("2026-11-09", "2026-11-06")).toBe(0);
  });
  it("rechnet Werktage vor und zurück", () => {
    expect(addWorkdays("2026-11-06", 1)).toBe("2026-11-09");
    expect(addWorkdays("2026-11-09", -1)).toBe("2026-11-06");
    expect(addWorkdays("2026-11-06", 7)).toBe("2026-11-17");
  });
});

describe("Ampel", () => {
  it("rot bei überschrittener Frist", () => {
    const s = projectSignal({ ...base, milestones: [{ title: "Zwischenauswertung", dueDate: "2026-11-03", doneAt: null }] }, now);
    expect(s).toMatchObject({ level: "red", blink: true, reason: "Zwischenauswertung überfällig · 3 T." });
  });
  it("rot, wenn unsere Antwort länger als 3 Werktage fehlt", () => {
    expect(projectSignal({ ...base, lastCustomerAt: "2026-11-01T09:00:00Z", lastTeamAt: "2026-10-30T09:00:00Z" }, now))
      .toMatchObject({ level: "red", waitingOn: "uns", reason: "Unsere Antwort fehlt · 5 T." });
    expect(projectSignal({ ...base, lastCustomerAt: "2026-11-04T09:00:00Z" }, now).level).toBe("green");
  });
  it("gelb bei naher Frist; blinkt nur bis zum Ansehen", () => {
    const m = [{ title: "Erstgespräch", dueDate: "2026-11-10", doneAt: null }];
    expect(projectSignal({ ...base, milestones: m }, now)).toMatchObject({ level: "yellow", blink: true, reason: "Erstgespräch in 2 T." });
    expect(projectSignal({ ...base, milestones: m, editorSeenAt: "2026-11-06T09:00:00Z" }, now).blink).toBe(false);
  });
  it("gelb, wenn der Kunde länger als 3 Werktage nicht antwortet", () => {
    expect(projectSignal({ ...base, lastTeamAt: "2026-10-30T09:00:00Z", lastCustomerAt: "2026-10-20T09:00:00Z" }, now))
      .toMatchObject({ level: "yellow", waitingOn: "Kunde", reason: "Kunde antwortet nicht · 5 T." });
  });
  it("erledigte Meilensteine zählen nicht, abgeschlossene Projekte sind grau", () => {
    expect(projectSignal({ ...base, milestones: [{ title: "x", dueDate: "2026-11-01", doneAt: "2026-10-31T00:00:00Z" }] }, now).level).toBe("green");
    expect(projectSignal({ ...base, status: "completed", milestones: [{ title: "x", dueDate: "2026-11-01", doneAt: null }] }, now)).toMatchObject({ level: "done", blink: false });
  });
  it("Schwelle ist einstellbar", () => {
    const input = { ...base, lastTeamAt: "2026-10-30T09:00:00Z" };
    expect(projectSignal(input, now, 3).level).toBe("yellow");
    expect(projectSignal(input, now, 10).level).toBe("green");
  });
});
