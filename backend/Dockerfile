# =============================================================================
# Backend — ASP.NET Core API standalone
# =============================================================================
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build

WORKDIR /app

COPY backend.csproj ./
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

# =============================================================================
# Esecuzione
# =============================================================================
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine

WORKDIR /app

# icu-libs = solo le librerie ICU; su Alpine i DATI locale (nomi mesi/valute, regole di
# collazione e formattazione per ogni lingua) stanno nel pacchetto separato icu-data-full.
# Senza, con GLOBALIZATION_INVARIANT=false qualsiasi cultura non-inglese (it-IT, ...) non
# trova i dati e ricade sulla root → inglese, rompendo date, numeri, ordinamento e validazioni
# dipendenti dalla cultura. icu-data-full copre TUTTI i locale: il template regge qualunque
# lingua configuri il figlio (i dati ICU non sono installabili per singola lingua su Alpine).
RUN apk add --no-cache icu-libs icu-data-full wget
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

COPY --from=build /app/publish ./

RUN mkdir -p /app/uploads /app/db && \
    adduser -D -u 1000 appuser && \
    chown -R appuser:appuser /app
USER appuser

ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://localhost:8080/health" || exit 1

ENTRYPOINT ["dotnet", "backend.dll"]
