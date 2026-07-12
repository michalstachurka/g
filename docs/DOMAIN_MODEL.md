# Model domenowy i kontrakt renderSpec

## 1. Rozdział danych

| Warstwa | Zawartość | Dostęp |
| --- | --- | --- |
| publiczna | branding, opublikowany schemat kroków, publiczny katalog, publiczne manifesty assetów (bindingi, wymiary bazowe, anchory), `renderSpec`, publiczne podsumowanie ceny, udostępnione konfiguracje | bez logowania, rate-limited |
| handlowa | pełne oferty, leady, rabaty handlowe, historia | role sales/dealer/tenant_admin |
| produkcyjna | BOM, koszty wewnętrzne, receptury, komentarze produkcyjne | role production/tenant_admin/platform_owner |

Reguły, formuły cen, koszty i BOM nigdy nie wychodzą przez API publiczne. Test `render-spec.guard.spec.ts` pilnuje listy pól zabronionych.

## 2. Encje (Prisma) i mapowanie na listę ze specyfikacji

Tenant, TenantDomain, TenantTheme (JSON tokenów), User, Membership(+rola), Session, AuditLog,
ProductCategory, ProductFamily, ProductModel, ProductVariant, ConfiguratorStep, FieldDefinition,
OptionGroup, Option, Asset, AssetVersion (manifest+raport), AssetBundle, AssetBundleItem,
RuleSet, Rule, PriceList, PriceRule, BomRecipe, BomItem, DocumentTemplate,
Configuration, ConfigurationSnapshot, Lead, GeneratedDocument, GeneratedModel, EmailLog.

Świadome scalenia (pełna zgodność funkcjonalna, mniejsza liczba tabel):
`OptionValue`→`Option.value/meta`; `TaxRule`→pola PriceList; `DiscountRule`→`PriceRule.kind='discount'`;
`Component`→pola BomItem; `RenderSpecSnapshot`→`ConfigurationSnapshot.renderSpec`; `ArJob`→`GeneratedModel(status)`;
`CompatibilityRule/ValidationRule`→`Rule.kind`; `TenantFeatureFlag`→`Tenant.featureFlags JSON`;
`Quote/QuoteLine`→`ConfigurationSnapshot(priceBreakdown)+GeneratedDocument(kind=sales_quote)`;
`Customer/Measurement/Attachment`→pola JSON `Lead.customer`, `Configuration.measurements`; `LicenseRecord`→`Asset.licenseInfo`.
Wszystkie byty publikowalne mają `status draft/published/archived`, `version`, `publishedAt/By`.

## 3. Kontrakt `renderSpec` v1 (źródło prawdy: `packages/contracts/src/render-spec.ts`)

```jsonc
{
  "renderSpecVersion": "1",
  "configurationRevision": 12,
  "widthMm": 900, "heightMm": 2100,          // wymiary handlowe światła ościeżnicy
  "openingDirection": "left" | "right",       // DIN
  "openingMode": "swing" | "sliding" | "fixed",
  "doorConstruction": "rebated" | "non_rebated" | "reverse" | "hidden",
  "modules": [{
    "slot": "door_leaf",                      // słownik ról semantycznych
    "publicAssetId": "pub_...",              // nieprzewidywalny identyfikator publiczny
    "assetVersion": 3,
    "visible": true,
    "mirrored": false,                        // dozwolone tylko gdy manifest mirrorPolicy=allow
    "transform": { "positionMm": [0,0,0], "rotationDeg": [0,0,0], "scale": [1,1,1] },
    "parts": [{ "role": "handle_inside", "visible": true, "positionMm": [160,1020,0], "mirrored": false }]
  }],
  "visibleParts": ["door_leaf","frame","handle_inside","handle_outside"],
  "publicMaterials": { "leaf_side_a": "dab-naturalny", "leaf_side_b": "bialy-mat", "frame": "bialy-mat", "handle": "czarny-mat", "glass": "szklo-satyna" },
  "animation": { "type": "hinge", "pivotAnchor": "hinge_axis", "pivotMm": [868,0,0], "maxAngleDeg": 95, "direction": 1 },
  "scene": { "mounting": "wall", "showMeasurementOverlay": true, "background": "studio" },
  "dinDiagram": { "hingeSide": "right", "opensInward": true },
  "checksum": "sha256:..."
}
```

Pola ZABRONIONE w renderSpec (test automatyczny): price, cost, margin, discount, bom, sku,
formula, rule (pełne definicje), tolerance, storagePath/url prywatny, tenant secrets, e-maile.

`evaluate` (POST /public/:tenant/evaluate) zwraca w jednej odpowiedzi:
`valid, errors[], warnings[], automaticAdjustments[], availableOptions{}, priceSummary{amount,currency,taxMode,lines[]?},
renderSpec, versions{ruleSet,priceList,assetSet,schema}, configurationRevision, checksum`.
Zapis konfiguracji zawsze wykonuje ponowne `evaluate` po stronie serwera.

## 4. Słownik ról semantycznych

door_leaf, frame, glass, glass_frame, handle_inside, handle_outside, lock_escutcheon,
hinges_public, threshold, sliding_rail, sliding_cover, sidelight_left, sidelight_right,
toplight, passive_leaf, active_leaf, mirror, decor_strip, wall_panel.

## 5. Manifest assetu (AssetVersion.manifest)

assetKey, assetVersion, semanticRole, variantKey, baseWidthMm/HeightMm/DepthMm, units, upAxis,
forwardAxis, mountingPlane (wall/floor), pivotPolicy, scalePolicy (fixed/uniform/width_height/approved_axes/variant_only),
approvedAxes?, allowedDimensionRange, mirrorPolicy (allow/variant_required),
nodeBindings [{role, nodePath, nodeName?, mirrorable}], materialBindings [{slotKey, appliesToRoles[], sides?}],
anchorBindings [{anchor, positionMm, normalized?}], animationBindings, compression, checksum.

`nodePath` to ścieżka indeksów węzłów od korzenia sceny (np. "0/3/1") — działa dla plików bez nazw
węzłów i nie wymaga od klienta zmiany nazw w Blenderze. Panel zapisuje mapowanie wizualnie.

## 6. Polityki skalowania (builder renderSpec + viewer + worker)

- wymiary domenowe w mm; konwersja do metrów wyłącznie w `packages/contracts/src/units.ts` (MM_TO_M)
- skala osi X = widthMm/baseWidthMm, Y = heightMm/baseHeightMm zgodnie z polityką; oś Z nigdy nie
  jest skalowana automatycznie; części `fixed` (klamki, zawiasy) dostają kompensację 1/scale rodzica
  albo pozycjonowanie anchorem poza skalowanym węzłem
- anchory w mm lub znormalizowane (0..1 względem wymiaru bazowego) — przeliczane po skalowaniu
- DIN: odbicie pozycji anchorów względem osi pionowej środka skrzydła; `mirrored` na module/części
  tylko przy `mirrorPolicy=allow`; w przeciwnym razie wymagany wariant assetu (błąd walidacji publikacji)
