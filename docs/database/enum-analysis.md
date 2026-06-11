# ENUM-analyse — InspeXi Beheer

Analyse van alle 32 PostgreSQL-enums in `schema.prisma`: waar ze gebruikt worden en of een **lookup table** handiger zou zijn dan een native enum.

## Besliskader

**Houd native enum wanneer:**

- De waarden vastliggen in applicatielogica (state machines, dispatch-switches, RBAC-checks).
- Code er direct naar verwijst en compile-time type-safety via Prisma waardevol is.
- Waarden zelden wijzigen en wijzigingen toch via migratie + deploy lopen.
- Er geen per-rij metadata nodig is (label, kleur, sortering, actief-vlag).
- De set globaal is voor alle tenants (niet per-org aanpasbaar).

**Verplaats naar lookup table wanneer:**

- Tenants/admins waarden runtime willen toevoegen, hernoemen of herordenen.
- Je extra attributen per waarde nodig hebt (label NL/EN, kleur, icoon, sortering, `is_active`, toegestane overgangen).
- Je in rapportages/queries wilt joinen op leesbare namen.
- De waarden vaak veranderen.

**PostgreSQL-specifieke aandachtspunten in dit project:** een enum uitbreiden vereist `ALTER TYPE ... ADD VALUE` (per wijziging een migratie + deploy); waarden verwijderen of hernoemen is omslachtig (type herbouwen); er is geen ruimte voor metadata, waardoor statuskleuren en kanban-volgorde nu hardcoded in de frontend zitten. Arrays van enums (`User.roles role[]`) werken prima.

## Samenvatting per enum

| Enum | Gebruikt in | Aard | Advies |
|---|---|---|---|
| `role` | User.roles[], Invitation, NotificationGroupPref | RBAC, guards | **Enum houden** |
| `contact_type` | Contact | Code-branching COMPANY/INDIVIDUAL | **Enum houden** |
| `price_type` | PriceTableItem | Drijft prijscalculatie | **Enum houden** |
| `audit_action` | AuditLog | Technisch, vast | **Enum houden** |
| `approval_status` | QuoteApprovalRequest | Workflow | **Enum houden** |
| `acceptance_status` | PlanningInspector, PlanningSessionInspector | Workflow | **Enum houden** |
| `reschedule_status` | RescheduleRequest | Workflow | **Enum houden** |
| `signature_type` | User, (offerte handtekening) | UI-mechanisme | **Enum houden** |
| `quote_template_type` | QuoteTemplate | Drijft renderpad BLOCKS/DOCX | **Enum houden** |
| `custom_field_type` | CustomFieldDefinition | Drijft input/validatie | **Enum houden** |
| `follow_up_assignee_type` | QuoteTemplateFollowUp | Toewijzingslogica | **Enum houden** |
| `task_entity_type` | Task | Polymorfe discriminator | **Enum houden** |
| `document_entity_type` | Document | Polymorfe discriminator | **Enum houden** |
| `note_entity_type` | Note | Polymorfe discriminator | **Enum houden** |
| `custom_field_entity_type` | CustomFieldDefinition | Polymorfe discriminator | **Enum houden** |
| `notification_type` | Notification, NotificationPref, NotificationGroupPref | Code-dispatch (23 waarden), unique-constraints | **Enum houden** |
| `email_template_type` | EmailTemplate | Code-koppeling aan gebruikspunten | **Enum houden** |
| `request_status` | Request, RequestStatusHistory | Statemachine + kanban | **Enum houden** + metadata extern |
| `quote_status` | Quote | Statemachine + badges | **Enum houden** + metadata extern |
| `task_status` | Task | Statemachine + kanban | **Enum houden** + metadata extern |
| `planning_status` | PlanningItem | Statemachine | **Enum houden** + metadata extern |
| `session_status` | PlanningSession | Statemachine | **Enum houden** + metadata extern |
| `project_status` | Project | Statemachine | **Enum houden** + metadata extern |
| `work_order_status` | WorkOrder | Statemachine | **Enum houden** + metadata extern |
| `error_report_status` | ErrorReport | Workflow (helpdesk) | **Enum houden** + metadata extern |
| `priority` | Request | Klein, vast | Enum houden (eventueel metadata) |
| `lost_reason` | Request | Bevat `ANDERS` → uitbreidbaar | **Lookup table — sterk** |
| `contact_person_role` | ContactPerson | Bevat `ANDERS` → uitbreidbaar | **Lookup table — sterk** |
| `log_type` | ContactLog | Interactie-categorie | Lookup — optioneel |
| `request_source` | Request | Herkomstkanaal | Lookup — optioneel |
| `task_type` | Task | Categorie/icoon | Lookup — optioneel |
| `follow_up_type` | QuoteTemplateFollowUp | Kanaal (EMAIL/TEL) | Lookup — optioneel |

## De drie groepen

### 1. Native enum houden (24 stuks)

De meeste enums zijn óf puur technisch (`audit_action`), óf koppelen direct aan code-logica (`price_type`, `quote_template_type`, `custom_field_type`, `follow_up_assignee_type`), óf zijn RBAC/dispatch-spil (`role`, `notification_type`, `email_template_type`). Hier zou een lookup table type-safety weghalen en niets toevoegen — de waarden worden door ontwikkelaars beheerd, niet door tenants.

De vier `*_entity_type`-enums zijn **polymorfe discriminatoren**: ze wijzen naar andere modules, niet naar een categorie die iemand zou willen aanpassen. Houden als enum.

> **Inconsistentie om op te ruimen:** `Notification.entityType`, `AuditLog.entityType` en `PlanningHistory.action` zijn vrije `String`-velden, terwijl Task/Document/Note/CustomFieldDefinition wél een enum gebruiken voor hetzelfde concept. Overweeg te standaardiseren (enum of gedeelde validatie) voor consistentie.

### 2. Status-enums: enum houden, maar metadata externaliseren

`request_status`, `quote_status`, `task_status`, `planning_status`, `session_status`, `project_status`, `work_order_status`, `error_report_status` sturen state machines, kanban-kolommen en "volgende toegestane status". Dat is precies waarom je ze **niet** tenant-bewerkbaar wilt maken: dan moet je de state machine data-gedreven maken (grote ingreep, hoog risico).

Tegelijk hebben ze nu hun presentatie (NL-label, kleur, sorteervolgorde) hardcoded in de frontend. Beter:

- **Lichte aanpak (aanbevolen):** houd de enum, en zet label/kleur/volgorde in één config-map in de frontend of in een kleine, niet-tenant-specifieke `status_metadata`-tabel (`enum_name`, `value`, `label_nl`, `color`, `sort_order`, `is_terminal`). Geen runtime-uitbreiding, wél centrale metadata.
- **Zware aanpak (alleen bij echte behoefte):** volledige lookup tables mét data-gedreven transities, per org. Pas doen als klanten echt eigen statussen eisen.

### 3. Lookup-table-kandidaten

**Sterk aanbevolen — `lost_reason` en `contact_person_role`.** Beide bevatten een `ANDERS`-ontsnappingswaarde, het klassieke teken dat de vaste set tekortschiet en gebruikers eigen waarden willen. Dit zijn pure labels zonder code-logica eraan vast, dus de overstap is goedkoop en laag risico.

**Optioneel — `log_type`, `request_source`, `task_type`, `follow_up_type`.** Verplaats alleen als je per-org maatwerk wilt (bijv. extra herkomstkanalen, een SMS/WhatsApp-followup, eigen interactietypes). `task_type` en `follow_up_type` sturen wel wat icoon-/kanaalkeuzes in code, dus die hebben een kleine code-impact.

## Aanbevolen lookup-table patroon (multi-tenant)

```prisma
model LostReason {
  id        String   @id @default(uuid()) @db.Uuid
  orgId     String?  @map("org_id") @db.Uuid   // null = globale default-seed
  code      String                              // stabiele sleutel, bijv. "TE_DUUR"
  label     String                              // NL weergave, bewerkbaar
  sortOrder Int      @default(0) @map("sort_order")
  isActive  Boolean  @default(true) @map("is_active")
  isSystem  Boolean  @default(false) @map("is_system") // beschermt seed-waarden
  createdAt DateTime @default(now()) @map("created_at")

  organization Organization? @relation(fields: [orgId], references: [id])
  requests     Request[]

  @@unique([orgId, code])
  @@map("imp_lost_reasons")
}
```

Kernpunten: `orgId` nullable zodat globale defaults én per-org toevoegingen naast elkaar bestaan; `code` als stabiele sleutel (referenties breken niet bij hernoemen van `label`); `isSystem` om seed-waarden te beschermen tegen verwijderen; `isActive` i.p.v. hard verwijderen (historie blijft kloppen). Op `Request` wordt `lostReason` dan een nullable FK i.p.v. een enum-kolom.

## Conclusie

Voor de meeste enums is native enum de juiste keuze — ze zijn code-gedreven en stabiel. Begin een eventuele migratie naar lookup tables klein en gericht: **`lost_reason` en `contact_person_role` eerst** (laag risico, duidelijke behoefte via `ANDERS`). Laat de status-enums met rust qua waarden maar haal hun presentatie-metadata uit de frontend-hardcoding. Bewaar de overige optionele kandidaten tot er een concrete klantvraag om maatwerk ligt.
