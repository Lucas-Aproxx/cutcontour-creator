# Eigen velden in de CRM

Je kan zelf kolommen ("vakjes") bijmaken in de CRM: een dropdown, een klein tekstvak of een groot tekstvak. Elke dropdown-optie krijgt een eigen naam en kleur.

## Wat je krijgt

- Knop **Veld toevoegen** boven de contactentabel. Je kiest:
  - **Naam** van het veld (bv. "Bron", "Bedrijf", "Verslag")
  - **Type**: Dropdown / Klein tekstvak / Groot tekstvak
  - Bij Dropdown: opties toevoegen, elk met een naam en een kleur (kleurkiezer met een palet, dus altijd leesbaar in licht en donker)
- Elk eigen veld verschijnt automatisch als extra kolom in de tabel, direct bewerkbaar per contact (net als de bestaande velden, met automatisch opslaan).
- Velden **beheren**: naam wijzigen, opties/kleuren aanpassen, volgorde wijzigen (omhoog/omlaag) en verwijderen met bevestiging.
- **Sorteren** kan ook op een eigen veld (via de sorteerknoppen bovenaan; bij dropdowns volgt de sortering jouw optie-volgorde).
- Bestaande kolommen (naam, telefoon, email, status, markering, terugcontact, notitie) blijven ongewijzigd.
- Alles staat in de database onder jouw account — niets lokaal.

## Technisch

- Nieuwe tabel `public.crm_fields`: `id`, `user_id`, `name`, `type` ('dropdown' | 'text' | 'longtext'), `options jsonb` (array van `{id, label, color}`), `position int`, timestamps. RLS `auth.uid() = user_id` voor ALL, met GRANTs voor `authenticated` en `service_role` (geen `anon`).
- Nieuwe kolom `public.contacts.custom jsonb not null default '{}'` — mapt veld-id naar waarde (string voor tekstvelden, optie-id voor dropdowns).
- `src/lib/data.ts`: `listCrmFields`, `createCrmField`, `updateCrmField`, `deleteCrmField`, en `custom` meenemen in de bestaande `Contact`-mapping/update.
- `src/components/CRM.tsx`: velden laden naast contacten, dynamische kolomkoppen en cellen renderen per veldtype, dialog voor toevoegen/beheren van velden, kleuren via inline stijl uit een vast token-palet, sorteersleutel uitbreiden met `custom:<fieldId>`.
