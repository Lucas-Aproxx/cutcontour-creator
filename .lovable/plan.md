# Plan: Exporteer alle presets als JSON/CSV uit de database

## Doel
Een knop in de Cutcontour-editor waarmee de ingelogde gebruiker al zijn/haar opgeslagen presets in één keer kan downloaden als JSON of CSV, rechtstreeks uit de Supabase-database.

## Huidige situatie
- Presets worden opgeslagen in de Supabase-tabel `presets` (RLS: gebruiker ziet alleen eigen rijen).
- Ophalen gebeurt via `listPresets()` in `src/lib/data.ts`.
- De preset-UI staat in `src/components/CutContourEditor.tsx` in de "Presets"-card.
- Er is al een "Back-up"-knop die de huidige lokale `presets`-array als JSON downloadt, maar er is nog geen CSV-export en geen expliciete "alles uit de database"-knop.

## Voorgestelde wijzigingen

### 1. Export-hulpfuncties toevoegen in `src/lib/data.ts`
- `exportPresetsToJson(presets)`
  - Geeft een JSON-string terug met het volledige preset-overzicht (id, naam, shapes).
  - X/Y in de output zijn het middelpunt van elke contour (`xMm + wMm/2`, `yMm + hMm/2`), zoals in de rest van de app.
- `exportPresetsToCsv(presets)`
  - Maakt een platte CSV met één regel per contour.
  - Kolommen: preset-naam, volgnummer, vorm, X (mm), Y (mm), L (mm), B (mm).
  - Gebruikt puntkomma's als scheidingsteken en een komma als decimaalteken (Nederlands/Belgisch formaat voor Excel), met een UTF-8 BOM.

### 2. UI in `src/components/CutContourEditor.tsx` uitbreiden
- In de "Presets"-card een formaat-kiezer toevoegen (JSON / CSV) met een knop **"Exporteer presets"**.
- Bij klik wordt eerst `listPresets()` aangeroepen voor de meest recente databasestand, vervolgens het bestand gegenereerd en gedownload via een tijdelijke Blob/URL.
- Toon een `toast`-melding bij succes of fout.

### 3. Coördinatenconsistentie
- Zowel JSON als CSV gebruiken het middelpunt van de contour voor X en Y, en de werkelijke lengte/breedte voor L en B — consistent met het afmetingenpaneel en het meetblad.

### 4. Geen backend-wijzigingen nodig
- De bestaande RLS-beleidsregels en `listPresets()`-functie zijn voldoende. Er hoeven geen nieuwe tabellen, policies of serverfuncties te komen.

## Testplan
1. Inloggen en minstens twee presets met meerdere contouren aanmaken.
2. Op "Exporteer presets" klikken voor JSON en controleren of alle presets en shapes correct in het bestand staan.
3. Op "Exporteer presets" klikken voor CSV en controleren of elke contour een eigen regel krijgt met correcte X/Y/L/B in mm.
4. Verifiëren dat de download alleen eigen presets bevat.
