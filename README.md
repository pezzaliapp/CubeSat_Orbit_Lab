# CubeSat Orbit Lab — pezzaliAPP (v2)

Gioco scientifico divulgativo che simula il lancio e il moto orbitale di un CubeSat attorno alla Terra.
Canvas 2D con proiezione prospettica (effetto 3D), nessuna libreria esterna, PWA offline.

## Funzioni
- Scenari rapidi: **Lancio**, **LEO 400 km**, **Ellittica 300×800 km**, **GTO** semplificata
- Parametri regolabili: perigeo, apogeo, inclinazione, RAAN (Ω), **argomento del perigeo (ω)**, **anomalia media iniziale (M₀)**,
  velocità simulazione, lunghezza scia.
- Elementi grafici: assi, atmosfera, ombra terminatore, trail orbitale, pannelli solari del CubeSat
- Look&Feel tipo KubeApp: palette, tipografia, micro-animazioni HUD e header
- PWA installabile con **service worker** e **manifest**

## Note fisiche
- Orbite calcolate con elementi kepleriani (2-body). L’inserimento in orbita è una transizione parametrica verso i target.
- L’effetto 3D è una proiezione prospettica su canvas 2D per massima portabilità.

## Deploy rapido su GitHub Pages
1. Crea un repo `CubeSat_Orbit_Lab` e carica i file della cartella.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Apri l’URL pubblicato (https://username.github.io/CubeSat_Orbit_Lab/).

MIT — © 2025 pezzaliAPP
