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

RUN apk add --no-cache icu-libs wget
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

COPY --from=build /app/publish ./

RUN adduser -D -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://localhost:8080/health" || exit 1

ENTRYPOINT ["dotnet", "backend.dll"]
