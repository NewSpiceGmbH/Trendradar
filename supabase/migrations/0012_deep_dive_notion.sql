-- Problem Deep Dive aus Notion: Gespräche als Link auf eine Notion-Seite (z. B. KI-Meeting-Notiz). Der Agent liest die
-- Seite über die Notion-API; gespeichert wird nur der Link, nicht der Inhalt (wie bei eingefügten Transkripten).
alter table deep_dive_sessions drop constraint deep_dive_sessions_source_check;
alter table deep_dive_sessions add constraint deep_dive_sessions_source_check check (source in ('paste', 'upload', 'notion'));
alter table deep_dive_sessions add column source_url text check (source_url ~ '^https://');
alter table deep_dive_sessions add constraint deep_dive_sessions_notion_url check (source <> 'notion' or source_url is not null);
