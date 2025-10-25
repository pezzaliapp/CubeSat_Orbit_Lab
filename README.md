# CubeSat Orbit Lab — pezzaliAPP (v3)

Aggiunte principali:
- **Drag atmosferico (LEO)** con parametro **BC (Cd·A/m)** semplificato
- **Ombra** con umbra/penombra + rilevamento eclissi del CubeSat
- **Export CSV** telemetria (t, x, y, z, alt, a, e, i, RAAN, ω, M₀)
- **Landing hero** e micro-animazioni stile KubeApp

## Note sul drag
Modello esponenziale molto semplificato: ρ = ρ₀·exp(-h/Hs) con ρ₀=1.225 kg/m³, Hs=8.5 km.
Decadimento di a ed e proporzionale a ρ e v³ (euristico per scopi divulgativi).

MIT — © 2025 pezzaliAPP
