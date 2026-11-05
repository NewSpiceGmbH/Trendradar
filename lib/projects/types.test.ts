import { describe, expect, it } from "vitest";
import { fmtBytes, safeFileName } from "./types";

describe("Projektdokumente", () => {
  it("macht Dateinamen pfadsicher", () => {
    expect(safeFileName("Grundriss Süd (final).pdf")).toBe("Grundriss-Sud-final.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFileName("???")).toBe("datei");
  });
  it("formatiert Dateigrößen", () => {
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(2048)).toBe("2 KB");
    expect(fmtBytes(5 * 1024 * 1024)).toBe("5,0 MB");
  });
});
