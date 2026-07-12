# ADR-0003: Pipeline USDZ

Status: przyjęte, 2026-07-11

## Kontekst
iOS wymaga USDZ (AR Quick Look). Konwertery natywne (usd_from_gltf) wymagają binariów spoza npm.
Modele publiczne w tym systemie są lekkie i bezteksturowe (materiały parametryczne).

## Decyzja
Worker generuje USDZ w Node przy pomocy USDZExporter z three (bez tekstur nie wymaga canvas).
Wynik dostaje checksum i wpis GeneratedModel(kind=usdz). Jeżeli eksport się nie powiedzie,
status = failed, a strona AR nie ustawia ios-src — wtedy model-viewer wykonuje na iOS konwersję
kliencką GLB->USDZ jako fallback. Oba pliki budowane są z tego samego renderSpec co viewer.

## Konsekwencje
- brak zależności natywnych; deterministyczny pipeline dla modeli bez tekstur
- dla przyszłych assetów z teksturami: dodać kolejkę z konwerterem natywnym (odnotowane w planie)
