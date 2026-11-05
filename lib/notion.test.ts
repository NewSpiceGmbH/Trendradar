import { describe, expect, it } from "vitest";
import { notionLinks, notionPageId, readNotionPage } from "./notion";

const ID = "1234567890abcdef1234567890abcdef";
const DASHED = "12345678-90ab-cdef-1234-567890abcdef";
const rt = (t: string) => [{ plain_text: t }];

describe("Notion", () => {
  it("findet die Seiten-ID in verschiedenen Linkformen", () => {
    expect(notionPageId(`https://www.notion.so/newspice/Meeting-Arena-Nord-${ID}`)).toBe(DASHED);
    expect(notionPageId(`https://www.notion.so/${ID}?v=abc`)).toBe(DASHED);
    expect(notionPageId(`https://newspice.notion.site/Meeting-${DASHED}#fffffffffffffffffffffffffffffff0`)).toBe(DASHED);
    expect(notionPageId("https://example.org/1234567890abcdef1234567890abcdef")).toBeNull();
    expect(notionPageId("kein link")).toBeNull();
  });

  it("holt Links aus freiem Text", () => {
    expect(notionLinks(`Hier: https://www.notion.so/a-${ID}\nund https://www.notion.so/a-${ID} doppelt`)).toHaveLength(1);
  });

  it("liest Seite und Unterblöcke als Text, auch über mehrere Seiten der Antwort", async () => {
    const calls: string[] = [];
    const answers: Record<string, unknown> = {
      [`/pages/${DASHED}`]: { id: DASHED, url: "https://www.notion.so/x", created_time: "2026-11-04T09:00:00Z", properties: { Name: { type: "title", title: rt("Meeting Arena Nord") } } },
      [`/blocks/${DASHED}/children?page_size=100`]: {
        results: [
          { id: "h", type: "heading_2", heading_2: { rich_text: rt("Zusammenfassung") } },
          { id: "t", type: "toggle", has_children: true, toggle: { rich_text: rt("Details") } },
          { id: "u", type: "unsupported", unsupported: {} },
        ],
        has_more: true, next_cursor: "c2",
      },
      [`/blocks/${DASHED}/children?page_size=100&start_cursor=c2`]: { results: [{ id: "p", type: "paragraph", paragraph: { rich_text: rt("Schlangen 12 Minuten.") } }], has_more: false, next_cursor: null },
      "/blocks/t/children?page_size=100": { results: [{ id: "b", type: "bulleted_list_item", bulleted_list_item: { rich_text: rt("Kasse ist der Engpass") } }], has_more: false, next_cursor: null },
    };
    const fetcher = async (url: string) => {
      const path = url.replace("https://api.notion.com/v1", "");
      calls.push(path);
      return new Response(JSON.stringify(answers[path] ?? {}), { status: answers[path] ? 200 : 404 });
    };
    const p = await readNotionPage(`https://www.notion.so/Meeting-${ID}`, { token: "secret", fetcher });
    expect(p.title).toBe("Meeting Arena Nord");
    expect(p.text).toBe("## Zusammenfassung\nDetails\n  - Kasse ist der Engpass\nSchlangen 12 Minuten.");
    expect(p.unsupported).toBe(1);
    expect(calls).toHaveLength(4);
  });

  it("erklärt, wenn die Seite nicht geteilt ist oder der Schlüssel fehlt", async () => {
    const notShared = async () => new Response("{}", { status: 404 });
    await expect(readNotionPage(`https://www.notion.so/${ID}`, { token: "x", fetcher: notShared })).rejects.toThrow(/Verbindungen/);
    await expect(readNotionPage(`https://www.notion.so/${ID}`, { token: "" })).rejects.toThrow(/NOTION_TOKEN/);
  });
});
