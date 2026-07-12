# ADR-0002: Storage przez adapter (FS w dev, S3 w prod)

Status: przyjęte, 2026-07-11

## Kontekst
Spec wymaga storage kompatybilnego z S3. Środowisko dev/demo nie ma działającego S3/MinIO.

## Decyzja
Interfejs `StorageService` (put/get/delete/publicUrl/signedUrl) z dwoma sterownikami:
`fs` (katalog var/storage, pliki publiczne serwowane przez API ze ścieżką tokenową, prywatne przez
krótkotrwałe podpisane URL-e HMAC) oraz `s3` (AWS SDK, ta sama sygnatura; konfiguracja przez env).
Wybór przez `STORAGE_DRIVER`. docker-compose zawiera MinIO do pracy lokalnej ze sterownikiem s3.

## Konsekwencje
Żadna ścieżka prywatna nie trafia do renderSpec (tylko identyfikatory publiczne pub_*).
