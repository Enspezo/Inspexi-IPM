# UI-Briefing: Atera-stijl admin voor InspeXi Portal

> **Doel van dit document.** Een kant-en-klare briefing voor Claude Code om de InspeXi Portal
> (React 18 + TanStack Query + Tailwind v4, custom UI-componenten) in te richten volgens de
> structuur en interactiepatronen van Atera (`app.atera.com/new`). De nadruk ligt op **structuur
> en gedrag** (navigatie, tabellen, filtering, rij-acties, smart buttons), niet op het exact
> kopiëren van Atera's visuele identiteit. Kleuren/branding blijven die van InspeXi.
>
> Gebaseerd op een directe inspectie van Atera (juni 2026): Dashboard, Tickets, Apparaten,
> Klanten en Beheerder.

---

## 0. Samenvatting — de 10 kernpatronen

1. **Drie-zone layout**: smalle icoon+label sidebar links, dunne globale topbar, brede content.
2. **Globale "Nieuw" smart-create knop** linksboven in de topbar: één dropdown om overal vandaan
   elke entiteit aan te maken (Ticket, Contact, Klant, Factuur, …).
3. **Record-tabs**: geopende detailrecords verschijnen als sluitbare tabbladen bovenaan de
   contentzone (naast "Tickets" / "Schema"), browser-achtig.
4. **Saved views**: elke lijstpagina heeft een "Standaardweergave"-dropdown om opgeslagen
   filter/kolom-combinaties te kiezen.
5. **Filter-drawer met telbadge**: "Filters • 2" opent een rechter slide-in paneel met
   afhankelijke dropdownfilters; het aantal actieve filters staat in de knop.
6. **Kolom-/tabelconfiguratie**: een sliders-icoon ("Tafelaanpassingen") → dichtheid
   (Gedetailleerd/Compact), "Bewerk kolommen" (tonen/verbergen + slepen om te herordenen),
   tabelbreedte, reset.
7. **Bulk-actiebalk**: een rij actieknoppen boven de tabel die uit-grijs is en pas activeert
   zodra je rijen aanvinkt ("1 geselecteerd").
8. **Inline-editable cellen**: dropdowns/placeholders direct in de tabelrij (technicus,
   prioriteit, status, "Voeg telefoon toe") — bewerken zonder de detailpagina te openen.
9. **Per-rij actiemenu**: een primaire actieknop + een caret/kebab (`…`) aan het einde van de rij.
10. **Context-switch settings-nav**: "Beheerder" vervangt de hele sidebar door een eigen
    settings-navigatie (terugpijl + zoekveld + accordion-groepen).

---

## 1. Globale layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Nieuw ▾]   [🔍 Zoek …]                       [Installeer agent] 🔔 ⚠ ? (MM)│  ← topbar (vast)
├───────────┬──────────────────────────────────────────────────────────────┤
│ ▣ Dashboard│  ┌ Tickets │ Schema │ #1 SAMPLE TICKET ✕ ┐  …               │  ← record-tabs
│ ▣ Tickets  │  ─────────────────────────────────────────                   │
│ ▣ Klanten  │  Tickets   [Standaardweergave ▾]              [+ Ticket] […]  │  ← page header
│ ▣ Apparaten│  [🔍 Zoeken] [▼ Filters • 2]                          [⚙]    │  ← toolbar
│ …          │  [Verwijderen][Toewijzen][Status]…       1 van 1 · 1 gesel.   │  ← bulk-bar
│            │  ☑ │ Klant │ Details │ … kolommen …                           │  ← tabel
│ ─────────  │                                                              │
│ ✦ AI Centrum│                                                             │
│ App Center │                                                              │
│ Beheerder ›│                                                              │
└───────────┴──────────────────────────────────────────────────────────────┘
```

### 1.1 Topbar (vast, ~56px)
- **Links**: `Nieuw ▾` (zie §2), daarnaast een brede globale zoekbalk ("Zoek …").
- **Rechts**: primaire context-CTA ("Installeer agent" bij Atera → bij InspeXi bv. context-loos
  of weglaten), notificatie-bel met badge, een waarschuwings-/systeemicoon, help (`?`),
  ronde gebruiker-avatar met initialen (opent account-menu).
- Topbar is sober, witte achtergrond, dunne onderrand. Géén kleur behalve iconen.

### 1.2 Primaire sidebar (links, ~220px, inklapbaar)
- Logo bovenaan + een **collapse-toggle** (icoon rechtsboven in de sidebar) om naar een smalle
  icoon-only modus te gaan.
- Navigatie-items = **icoon + label**, royale regelhoogte, subtiele hover-highlight, actieve
  item krijgt een lichte gevulde achtergrond + accentkleur op icoon/label.
- **Badges** naast items voor nieuwe features (paarse `New`/`Nieuw` pill, bv. "Activa-inventaris").
- **Onderaan** een visueel gescheiden blok (dunne scheidingslijn) voor secundaire items:
  AI Centrum, App Center, Beheerder.
- Drie soorten items:
  - **Directe link** (Dashboard, Tickets, Klanten, Apparaten …).
  - **Flyout-submenu**: item met `…`/chevron dat een klein zwevend menu naast de sidebar opent.
    Voorbeeld "Meer" → *Kennisbank*, *Verwijs een vriend*.
  - **Expandable / context-switch** (chevron `›`): "Rapporten" (→ Klassieke Rapporten,
    Geavanceerde Rapporten) en "Beheerder" (zie §9).

> **InspeXi-mapping.** Jullie hebben dit al deels: `components/layout/sidebar.tsx` met
> `navItems[]` (`to`, `label`, `icon`, `roles?`, `children?`) en rol-filtering. Uitbreidingen:
> (a) collapse-toggle naar icoon-only, (b) `New`-badge support per item, (c) onderste
> secundaire sectie met scheidingslijn, (d) flyout-submenu component voor items met `children`
> wanneer de sidebar is ingeklapt of voor "overflow"-items.

---

## 2. Globale "Nieuw" smart-create knop

Eén dropdown linksboven die overal beschikbaar is. Atera-inhoud:

```
Ticket
Contact
Klant
Factuur
Activa            [Nieuw]
Script
Gemonitord apparaat   ›   (submenu)
Agentinstallateur
```

Patroon: gegroepeerde lijst, scheidingslijnen tussen logische clusters, sommige items met een
`New`-badge, scommige met een eigen submenu (`›`). Elk item opent de bijbehorende
create-modal/flow ongeacht op welke pagina je staat.

> **InspeXi-mapping.** Maak een `GlobalCreateMenu` in de topbar. Items afgeleid van de domeinen
> + rol-zichtbaarheid: *Aanvraag*, *Offerte*, *Contact*, *Klant/Organisatie*, *Taak*,
> *Product*, *Document uploaden*. Elk item triggert de bestaande `CreateXxxModal`. Respecteer
> `@Roles`/rol-filtering net als de sidebar.

---

## 3. Record-tabs (geopende detail-records als tabbladen)

Bovenaan de contentzone staan tabbladen: de vaste view-tabs ("Tickets", "Schema"=bord) plus
**dynamische tabs per geopend record** (bv. `#1 SAMPLE TICKET …` met een sluit-`✕`). Rechts een
`…`-overflow voor tab-acties. Hierdoor kun je meerdere records tegelijk open hebben en snel
wisselen zonder de lijst te verliezen.

> **InspeXi-mapping.** Optioneel maar krachtig. Implementeerbaar als een tab-strip die open
> detailroutes bijhoudt (state in een context/provider, eventueel gesynchroniseerd met de
> URL). Begin desgewenst met alleen de **view-tabs** (Lijst / Kanban) en voeg record-tabs later
> toe. Jullie Kanban bestaat al (`requests-kanban.tsx`) → dat wordt de "Schema/Bord"-tab.

---

## 4. Pagina-header van een lijstpagina

Eén consistente kop boven elke lijst:

- **Links**: paginatitel (bv. "Tickets", "Apparaten") + direct ernaast de **saved-views
  dropdown** ("Standaardweergave ▾").
- **Rechts**: primaire **+ create**-knop (vaak een **split button** met dropdown, bv.
  "+ Nieuw apparaat ▾"), een **export/download**-icoon, en een `…`-overflow voor minder
  gebruikte pagina-acties.

### 4.1 Saved views ("Standaardweergave")
Een dropdown om opgeslagen weergaven te kiezen/maken. Een view = combinatie van *filters +
zichtbare/volgorde kolommen + dichtheid + sortering*. Standaard is er "Standaardweergave";
gebruikers kunnen eigen views opslaan.

> **InspeXi-mapping.** Jullie `useTableConfig({ pageKey, columns })` slaat al kolom/filterconfig
> per `pageKey` op in localStorage. Til dit op naar **named views**: bewaar meerdere configs per
> `pageKey` onder een naam + markeer er één als default. UI = dropdown naast de titel.

---

## 5. Toolbar: zoeken, filters, tabelaanpassingen

Onder de header, op één regel:

- **Zoeken**: tekstveld dat client/server-side filtert.
- **Filters • N**: knop met **telbadge** van het aantal actieve filters. Opent een
  **rechter slide-in drawer** "Filteren" met bovenin een **Resetten**-link en daaronder een
  reeks filtervelden (zie §6).
- **Tafelaanpassingen** (sliders-icoon, rechts): popover-menu (zie §7).

> **InspeXi-mapping.** Jullie `TableConfigSidebar` dekt al filters + kolommen in één
> rechter-sidebar. Atera splitst dit: **Filters** (drawer) gescheiden van **Tafelaanpassingen**
> (kolommen/dichtheid, popover). Aanbevolen: behoud jullie geïntegreerde aanpak maar voeg de
> **telbadge** "Filters • N" toe en een aparte **dichtheid**-toggle.

### 5.1 AI / natural-language filter (Apparaten-pagina)
Op Apparaten is de zoekbalk een **AI-filter**: "Beschrijf wat je wilt filteren" + een `i`-info
icoon + een toggle **"+ Vraag"** (AI aan/uit). Daarnaast snelfilters als chips:
**Klanten** (multi-select dropdown met zoekveld + "Selecteer alles"/"Wissen"), **Favoriet**,
**Filters**.

> **InspeXi-mapping.** AI-filter is optioneel/later. Het **chip-snelfilter**-patroon (een
> multi-select dropdown per dimensie, met zoek + selecteer-alles/wissen) is wél direct nuttig,
> bv. "Klant", "Status", "Toegewezen technicus" als chips naast de zoekbalk.

---

## 6. Filter-drawer (rechter paneel)

Slide-in van rechts, kop "Filteren" + "✕ Resetten". Inhoud = verticale lijst van filtervelden,
elk een dropdown met default **"Alle"**. Voorbeeld (Tickets):

`Tags · Spam (Niet-spam tickets) · Status (Open, In afwachting) · Toegewezen Technicus ·
Toegewezen Groep · Creation Date · Activiteitsstatus · Goedkeuringsstatus · Vervaldatum ·
Ticketprioriteit`

Kenmerken:
- Multi-select per veld; geselecteerde waarden tellen mee in de "Filters • N" badge.
- **Afhankelijke filters**: op Klanten is "Region" uitgegrijsd tot er een "Land" is gekozen.
- Datumvelden hebben hun eigen date-range UI.

> **InspeXi-mapping.** `ColumnDef<T>` heeft al `filterable` + `filterType`
> (text/select/date/boolean) + `getFilterValue`. Genereer de drawer-velden hieruit. Voeg toe:
> (a) **default "Alle"** weergave, (b) **telbadge** afgeleid van het aantal velden ≠ "Alle",
> (c) ondersteuning voor **afhankelijke filters** (een filter dat pas enabled is als een ander
> gevuld is), (d) een **Resetten**-knop.

---

## 7. Tabelaanpassingen (sliders-popover)

Popover-menu met:

- **Dichtheid**: `Gedetailleerd` (default, ✓) / `Compact`.
- **Bewerk kolommen** → paneel met **zoekveld** + lijst van alle kolommen, elk met
  **checkbox** (tonen/verbergen) en **drag-handle** (`⋮⋮`) om de **volgorde** te herordenen.
  Voorbeeld kolommen Tickets: Details, Ticket ID, Customer, SLA, Sentiment, Toegewezen Groep,
  Toegewezen Technicus, Apparaat, Prioriteit, Goedkeuringsstatus, Activiteitsstatus, Status,
  Laatste actiedatum, Creation date …
- **Pas aan de tabelbreedte** (kolommen passend maken).
- **Tabelinstellingen resetten**.
- **Toetsenbordnavigatie** (toggle).

> **InspeXi-mapping.** Breid `useTableConfig`/`TableConfigSidebar` uit met: dichtheid-modus
> (rij-hoogte + padding via Tailwind-varianten), drag-reorder van kolommen (`@dnd-kit` heb je
> al), "fit width", en een reset. Bewaar in localStorage per `pageKey` (zoals nu).

---

## 8. De tabel zelf

### 8.1 Kolomstructuur
- Eerste kolom = **selectie-checkbox** (+ een caret op de header-checkbox voor
  "selecteer alle/pagina/none"-opties).
- **Avatar/logo-kolom** voor de hoofd-entiteit (bv. klantlogo, of initialen-tegel).
- **"Details"-kolom** = rijke, meerregelige cel: titel + subregels (status-label, aanvrager,
  "Gemaakt 13 minuten geleden"). Dit is de visuele anker-kolom.
- Domeinkolommen, eindigend met een **actie-kolom** rechts.

### 8.2 Inline-editable cellen (belangrijk patroon)
Veel cellen zijn **direct bewerkbaar in de rij** via een dropdown, zonder de detailpagina te
openen:
- Tickets: *Toegewezen Groep ▾*, *Toegewezen Technicus ▾* (met avatar + online-dot),
  *Prioriteit ▾* ("Laag"), *Activiteitsstatus* (gekleurde dot + label "Wachten op reactie ▾").
- Klanten: lege cellen tonen **placeholders als call-to-action**: "Voeg telefoon toe",
  "Voer adres in", "Stel rang in" → klikken = inline invullen.
- Technici (admin): *Beschikbaarheid ▾* (groene dot "Beschikbaar"), *Status*-badge
  ("In afwachting"), *Rol* als link.

### 8.3 Status- en telbadges
- **Status**: gekleurde dot + tekst (groen=online/beschikbaar, paars/oranje=wachtend) of een
  gevulde **pill-badge** (geel "In afwachting", blauw "Open").
- **Telbadges**: ronde gekleurde pills voor aantallen, bv. waarschuwingen per apparaat
  (rood `2`, amber `2`, blauw `1`) — kleur = severity.

### 8.4 AI-kolom
Een smalle kolom met een **sparkle/AI-knop** per rij (snelle AI-actie op dat record).

### 8.5 Per-rij acties
- Een **primaire actieknop** (bv. "Remote" op Apparaten) **+ een caret/kebab `…`** aan het
  einde van de rij die een dropdown met meer acties opent (bewerken, verwijderen, …).
- In admin-tabellen is dit puur een **kebab `…`** rechts in de rij.

### 8.6 Bulk-actiebalk
Boven de tabel staat een rij actieknoppen die **uitgegrijsd** is en pas **activeert bij
selectie**. Tickets: `Verwijderen · Ticket toewijzen · Status instellen · Stel prioriteit in ·
Tickets samenvoegen`. Apparaten: `Script uitvoeren · Wijs automatiseringsprofiel toe ·
Software-installatie · Toewijzen drempelprofiel · …`. Rechts verschijnt "N geselecteerd".

### 8.7 Telling & paginering
Rechtsboven de tabel: "Weergeven X van Y" (+ "N geselecteerd" bij selectie).

### 8.8 Lege staat (empty state)
Vriendelijke illustratie + kop ("Dat is triest…Je hebt geen apparaten") + subtekst + primaire
CTA-knop ("Installeer een Agent"). Elke lijst heeft een eigen empty state.

> **InspeXi-mapping.** Jullie `Table`-component + `ColumnDef<T>` + `DetailPageLayout` dekken de
> basis. Toe te voegen, in volgorde van waarde:
> 1. **Inline-edit cellen** via een `renderCell`/`editable` optie op `ColumnDef` (dropdown,
>    inline-text, status-select). Mutatie via bestaande `useUpdateXxx()` hooks (optimistic).
> 2. **Bulk-selectie + actiebalk**: selectie-state in de tabel, balk activeert bij `>0`.
>    Acties hergebruiken bestaande mutatie-hooks.
> 3. **Status/severity-badges** als herbruikbare `Badge`-varianten (jullie hebben `Badge` al).
> 4. **Per-rij actiemenu** als `RowActions` (kebab) component, rol-afhankelijk.
> 5. **Rijke "Details"-cel** (titel + metaregels) i.p.v. losse kolommen waar passend.
> 6. **Empty-state** component met illustratie + CTA per pagina.

---

## 9. Beheerder = context-switch settings-navigatie

Klikken op "Beheerder" **vervangt de hele primaire sidebar** door een settings-sidebar:

- Kop met **terugpijl `←` + "Beheerder"** (terug naar de hoofdnavigatie).
- **Zoekveld** bovenin om door alle instellingen te zoeken.
- **Accordion-groepen** (inklapbaar, elk met chevron), met op een groep een paarse "new"-dot:
  `Mijn account · Gebruikers en beveiliging · Monitoring en automatisering ·
  Ondersteuning en ticketing · Klantenservice · Gegevensbeheer• · Bedrijfskunde ·
  App Center-instellingen`.
- Uitgeklapt voorbeeld — **Gebruikers en beveiliging**: *Technici · Technicusgroepen ·
  Toegangsrollen · Beveiliging en authenticatie · Auditlog*.
- Settings-content gebruikt **dezelfde tabelpatronen** als de rest (statkaart-koppen, zoek,
  toggles zoals "Verberg gedeactiveerde technici", tabel met inline-dropdowns + kebab).

> **InspeXi-mapping.** Jullie `/organization/settings`, `/users`, etc. passen hierin. Bouw een
> **settings-shell**: terugpijl naar `/dashboard`, zoekveld, accordion-groepen op basis van
> rol. Groepeer bestaande settingspagina's (Gebruikers & rollen, Organisatie, Notificaties,
> Prijstabellen/Producten config, Audit log). Hergebruik de standaard tabel-/detailpatronen.

---

## 10. Dashboard

Een **widget-grid** (configureerbaar):
- Header: titel "Dashboard" + **"Volledig scherm invoeren"** + **"Bewerk widgets ▾"**.
- Widgets in een responsive grid, elk een kaart met titel + optioneel `?`-help-tooltip:
  *Ticketstatus* (telkaarten met gekleurde labels: Open/In afwachting/Vervaldatum vandaag/
  Achterstallig), *Waarschuwingsstatus*, *Niet-toegewezen tickets* (mini-tabel),
  *Recente waarschuwingen*, *Beschikbaarheidsmonitoring* (tabel per apparaattype),
  *Klantmeldingen*, *Serverwaarschuwingen* (grafiek), *Ticketactiviteit* (bar chart
  Geopend/Opgelost), *Producttickets*, *Kaartoverzicht* (Google Map), *Gemiddelde ticket
  SLA-statistieken* (groot getal), *Tevredenheid* (sterren), *Ontevreden klanten*,
  *Klanten tickets*, *Kritieke en achterstallige tickets*.

> **InspeXi-mapping.** Bouw een widget-grid met een vaste set kaarten die op jullie domeinen
> mappen: *Aanvragen-status*, *Niet-toegewezen aanvragen*, *Mijn taken*, *Offertes ter
> goedkeuring/verstuurd*, *Recente notificaties*, *Aanvraag-activiteit (chart)*,
> *Offerte-conversie*, *SLA/doorlooptijd*. Maak "Bewerk widgets" + fullscreen optioneel
> (v2). Grafieken: kies één lib (bv. Recharts) consistent.

---

## 11. Implementatie-volgorde (aanbevolen voor Claude Code)

**Fase 1 — Tabel-fundament (hoogste hergebruik):**
1. Generieke `DataTable` op basis van `ColumnDef<T>`: selectie-checkboxes, sticky header,
   dichtheid (Gedetailleerd/Compact), "Details"-cel, status-`Badge`s, AI/actie-kolommen.
2. **Bulk-actiebalk** (activeert bij selectie) + "N van M · N geselecteerd"-teller.
3. **Per-rij `RowActions`** (primaire actie + kebab), rol-afhankelijk.
4. **Inline-edit cellen** (dropdown/select/inline-text) via `useUpdateXxx()` optimistic.
5. **Empty-state** component.

**Fase 2 — Filtering & views:**
6. **Filter-drawer** (rechts) gegenereerd uit `ColumnDef.filterable`, met "Alle"-defaults,
   afhankelijke filters, Resetten, en **"Filters • N" telbadge**.
7. **Tafelaanpassingen-popover**: kolommen tonen/verbergen + **drag-reorder** (`@dnd-kit`),
   dichtheid, fit-width, reset.
8. **Named saved views** ("Standaardweergave"-dropdown) bovenop `useTableConfig`.
9. **Chip-snelfilters** (multi-select met zoek + selecteer-alles/wissen).

**Fase 3 — Navigatie & shell:**
10. Sidebar: collapse-toggle (icoon-only), `New`-badges, onderste secundaire sectie,
    flyout-submenu's.
11. Topbar: globale **"Nieuw" smart-create** dropdown + globale zoek.
12. **Settings-shell** (Beheerder): terugpijl + zoek + accordion-groepen.
13. **Record-tabs** + view-tabs (Lijst/Kanban) — Kanban bestaat al.

**Fase 4 — Dashboard:**
14. Widget-grid met domeingerichte kaarten; later "Bewerk widgets" + fullscreen.

---

## 12. Concrete checklist per bestaand InspeXi-onderdeel

| Atera-patroon | InspeXi-bestand om uit te breiden / nieuw te maken |
|---|---|
| Primaire sidebar + flyouts + badges | `components/layout/sidebar.tsx` |
| Globale "Nieuw" knop | nieuw: `components/layout/global-create-menu.tsx` (in topbar) |
| Saved views dropdown | uitbreiden: `components/table-config/` + `useTableConfig` |
| Filter-drawer + telbadge | uitbreiden: `TableConfigSidebar` of nieuw `FilterDrawer` |
| Tafelaanpassingen (kolommen/dichtheid) | uitbreiden: `TableConfigSidebar` + `ColumnDef<T>` |
| Bulk-actiebalk | nieuw: `components/ui/bulk-action-bar.tsx` + selectie-state in `Table` |
| Inline-edit cellen | uitbreiden: `ColumnDef<T>` met `editable`/`renderCell` |
| Per-rij actiemenu (kebab) | nieuw: `components/ui/row-actions.tsx` |
| Status/severity badges | uitbreiden: `components/ui/Badge` varianten |
| Empty states | nieuw: `components/ui/empty-state.tsx` |
| Settings-shell (Beheerder) | nieuw: `components/layout/settings-layout.tsx` |
| Record-tabs / view-tabs | nieuw: tab-strip provider; Kanban = `requests-kanban.tsx` |
| Dashboard widget-grid | uitbreiden: dashboard-pagina |

---

## 13. Belangrijke nuances om niet te missen

- **"Alle" als default** in filters (niet leeg) — communiceert "geen filter actief".
- **Telbadges overal**: actieve filters, selectie-aantal, severity-aantallen.
- **Uitgegrijsd → actief** als interactiegrammatica (bulk-bar, afhankelijke filters).
- **Inline bewerken vóór navigeren**: zoveel mogelijk in de rij afhandelen. Dit sluit aan op
  jullie eigen conventie dat de Overzicht-tab inline bewerkbaar moet zijn.
- **Placeholders als CTA** in lege cellen ("Voeg telefoon toe") i.p.v. een streepje.
- **Consistentie**: dezelfde tabel-/filter-/actiepatronen op élke pagina, inclusief settings.
- **Rol-zichtbaarheid** doortrekken naar create-menu, bulk-acties en rij-acties (jullie
  `Role`-enum + `@Roles`).
- Branding blijft InspeXi: neem Atera's **structuur en interactie** over, niet de kleuren.

---

# Deel B — Deep dive (uitgebreide bevindingen)

> Verdieping op vier onderdelen na een tweede, gedetailleerde inspectie. Plus een
> bijbehorend wireframe: zie `docs/atera-ui-wireframe.svg`.

## B1. Ticket-detailpagina (`/new/ticket/:id`)

Klassieke **drie-koloms** detailweergave; opent als **record-tab** bovenaan (sluitbaar).

**Headerbalk (sticky):**
- Links: terugpijl `←`, `#1 | <titel>`, subregel "Gemaakt … • Gewijzigd …".
- Rechts: **Copilot** (AI-assistent), **+ Tickettools ▾**, **… overflow**, en een
  "Op dit ticket"-indicator met avatar(s) van wie het ticket nu bekijkt (presence).

**Midden-kolom (werkzone), van boven naar beneden:**
1. **Property-bar** (één kaart, inline-editable): `Status ▾` (badge), `Technicus toewijzen ▾`
   (avatar + online-dot), `Toegewezen groep ▾`, `Activiteitsstatus ▾` (gekleurde dot +
   "Wachten op reactie van de technicus"), `Sentiment` (badge "Neutraal").
2. **Reply-composer**: tabs `Open antwoord` / `Interne opmerking`, tekstveld, AI-knop
   **"Genereer antwoord"**, plus iconen voor sjabloon/bijlage.
3. **Conversatie**: tabs `Gesprek N` / `Ticketactiviteit N` (audit/activiteitenlog). Boven de
   thread: `Filters`, sorteer `Nieuwste ▾`, AI **"Genereer artikel"** (→ KB-artikel uit ticket).
   Berichten = avatar + naam + timestamp + per-bericht caret-menu.

**Rechter-kolom (accordion-panelen, elk inklapbaar met chevron):**
- **Tijdregistratie**: live timer `00:00:00` + play, "Handmatige tijdinvoer",
  "Bekijk alle tijdinvoeren".
- **Contactinformatie**: Contact (link + potlood-edit), Functietitel, Klant, Contract
  ("Contract aanmaken"), Telefoon, E-mail, Apparaat ("Koppel apparaat"),
  "<naam>'s tickets (N)".
- **Ticketeigenschappen**: Type `Incident ▾`, Formulier sjabloon, Tags (chips met ✕),
  Prioriteit `Laag ▾`, Impact `Geen Impact ▾`, Product Family ▾.
- **Kalender evenementen** (inklapbaar).

**Menu-inhoud (uitgelezen):**
- **+ Tickettools**: *Goedkeuring* → Goedkeuring aanvragen (NEW); *Kind* → Nieuwe
  kinderticket / Bestaande kinderticket(s); *Ouder* → Nieuwe ouderticket / Bestaande
  ouderticket. (Parent/child-relaties + approval-flow.)
- **… overflow**: Samenvoegen · Markeer als spam · Verwijderen · Afdrukken · Producten en
  uitgaven · Beheer ticketinstellingen.

> **InspeXi-mapping.** Dit is jullie aanvraag- én offerte-detailpagina-blueprint. Jullie hebben
> al: detail-tabs, inline-edit Overzicht-tab, `AuditHistory` (= "Ticketactiviteit"),
> `DocumentsSection`. Toe te voegen: (a) **property-bar** met inline-edit dropdowns bovenaan,
> (b) rechter **accordion-panelen** i.p.v. één platte sidebar (Contactinfo, Eigenschappen,
> Tijd/Activiteit), (c) een **comment/log-composer** met intern/extern-toggle, (d) een
> **tools-dropdown** voor relatie-acties (koppel offerte/aanvraag), (e) een **overflow** met
> verwijderen/afdrukken/samenvoegen. Houd "presence" en AI-knoppen optioneel (v2).

## B2. Filter-drawer — volledig gedrag

- Rechter slide-in "Filteren", kop + **✕ Resetten** (zet alles terug op "Alle").
- Elk veld = dropdown met default-label **"Alle"**; de **"Filters • N"** telbadge telt elk veld
  dat ≠ "Alle".
- **Multi-select velden** = **checklist** in de dropdown. Voorbeeld `Status`:
  ☑ Open · ☑ In afwachting · ☐ Opgelost · ☐ Gesloten · ☐ Verwijderd. De geselecteerde waarden
  worden samengevat in het veld ("Open, In afwachting").
- **Datumvelden** (`Creation Date`, `Vervaldatum`) = **preset-ranges**: Alle · Vandaag ·
  Gisteren · Last Week · Last Two Weeks · (… Last Month / Aangepast bereik).
- **Afhankelijke filters**: op Klanten is `Region` **disabled** tot er een `Land` gekozen is.
- Volledige Tickets-filterset: Tags · Spam (Niet-spam/Spam) · Status · Toegewezen Technicus ·
  Toegewezen Groep · Creation Date · Activiteitsstatus · Goedkeuringsstatus · Vervaldatum ·
  Ticketprioriteit.

> **InspeXi-mapping.** Genereer de drawer uit `ColumnDef<T>.filterable/filterType`. Implementeer
> drie veldtypes: **multi-select checklist** (filterType `select`), **preset-date-range**
> (filterType `date` → dropdown met vaste ranges i.p.v. losse kalender), en **text**. Voeg
> `dependsOn`/`disabledUntil` toe voor afhankelijke filters. Telbadge = aantal velden ≠ default.

## B3. Rij-actiemenu's — varianten

Atera kent **drie** rij-actiepatronen; kies per tabel wat past:

1. **Inline-edit dropdowns** (Tickets): geen apart menu — losse cellen (technicus, prioriteit,
   status) zijn zelf dropdowns. Snelste voor veelgewijzigde velden.
2. **Split primaire knop + contextmenu** (Apparaten): een primaire actieknop met caret. De
   **Remote-caret** opent providerkeuze (Splashtop GRATIS · AnyDesk GRATIS · TeamViewer ·
   ScreenConnect · Instellingen voor externe toegang). Een tweede **tools-dropdown** geeft
   beheeracties: Patchbeheer · Software-inventaris · Software-installatie · Script uitvoeren ·
   Service Manager · Taakbeheerder · Afsluitacties · Opdrachtprompt · PowerShell ·
   Gebruikersactiviteit · Apps · Meer tools.
3. **Kebab `…`** (admin-tabellen, bv. Technici): compact menu rechts in de rij voor
   bewerken/verwijderen/deactiveren.

> **InspeXi-mapping.** Maak één `RowActions`-component dat alle drie ondersteunt via props:
> `inlineEditors` (cell-renderers), een optionele `primaryAction` (split-button) en een
> `menuItems[]` (kebab). Acties rol-afhankelijk (`@Roles`) en hergebruiken bestaande
> `useUpdateXxx()/useDeleteXxx()` hooks. Voor InspeXi-aanvragen: primaire actie = "Open", menu =
> Bewerken · Status wijzigen · Offerte koppelen · Document toevoegen · Verwijderen.

## B4. Dashboard-widgets + "Bewerk widgets"-flow

- Header: **"Volledig scherm invoeren"** (fullscreen/TV-modus) + **"Bewerk widgets ▾"**.
- **"Bewerk widgets"** = **checklist om widgets te tonen/verbergen** + **"Reset naar
  standaard"**. Beschikbare widgets: Beschikbaarheidsmonitoring · Recente waarschuwingen ·
  Serverwaarschuwingen · Kaartoverzicht · Gemiddelde ticket SLA-statistieken · Klantmeldingen ·
  Klanten tickets · Ticketactiviteit · Kritieke en achterstallige tickets · Niet-toegewezen
  tickets · Tevredenheid · Ontevreden klanten · Producttickets · Patchingstatus · Recente
  kritieke waarschuwingen.
- **Widget-typen** (hergebruikbare kaart-varianten): *stat/teller-rij* (Ticketstatus:
  Open/In afwachting/Vervaldatum vandaag/Achterstallig met gekleurde labels), *mini-tabel*
  (Niet-toegewezen tickets), *bar chart* (Ticketactiviteit: Geopend/Opgelost), *line chart*
  (Serverwaarschuwingen), *groot KPI-getal* (SLA "00m"), *sterren-rating* (Tevredenheid),
  *kaart* (Google Map), *lege lijst* (Recente waarschuwingen).

> **InspeXi-mapping.** Bouw een widget-grid met een **widget-registry** (id, titel, type,
> data-hook, rol). "Bewerk widgets" = checklist die `enabledWidgets[]` in user-prefs/localStorage
> bewaart + reset. Begin met 4-6 widget-typen (stat-rij, mini-tabel, bar chart, KPI-getal) en
> map ze op InspeXi-domeinen: Aanvraagstatus, Niet-toegewezen aanvragen, Mijn taken, Offertes
> ter goedkeuring, Aanvraag-activiteit, Offerte-conversie. Drag-rearrange + fullscreen zijn v2.

## B5. Volledige Beheerder-navigatie (uitgelezen)

`Mijn account` · `Gebruikers en beveiliging` (Technici · Technicusgroepen · Toegangsrollen ·
Beveiliging en authenticatie · Auditlog) · `Monitoring en automatisering` ·
`Ondersteuning en ticketing` · `Klantenservice` · `Gegevensbeheer` · `Bedrijfskunde` ·
`App Center-instellingen`. Settings-content hergebruikt overal de standaard tabel-/detail-
patronen (statkaart-kop, zoek, toggle "Verberg gedeactiveerde …", tabel met inline-dropdowns +
status-badges + kebab).
```
