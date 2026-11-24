# Image de la boutique : PrestaShop + module slimroom + front 3D compilé.
# La même image sert en local (docker compose) et servira pour le cloud.

FROM node:26-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM prestashop/prestashop:9.2.1-apache
# L'installeur de PrestaShop 9 supprime lui-même son dossier install/ ; le script
# de démarrage de l'image tente de le supprimer une seconde fois, échoue, et le
# conteneur s'arrête avant les scripts post-installation. On rend ce `rm` tolérant.
# hadolint ignore=SC2016
RUN sed -i 's|rm -r /var/www/html/\$PS_FOLDER_INSTALL/|rm -rf /var/www/html/$PS_FOLDER_INSTALL/|' /tmp/docker_run.sh \
    && grep -q 'rm -rf /var/www/html/\$PS_FOLDER_INSTALL/' /tmp/docker_run.sh
COPY --chown=www-data:www-data prestashop/modules/slimroom /var/www/html/modules/slimroom
COPY --chown=www-data:www-data --from=frontend /app/dist /var/www/html/modules/slimroom/views/dist
COPY --chmod=755 prestashop/post-install /tmp/post-install-scripts
# Filet de sécurité pour un checkout Windows resté en CRLF : un « \r » en fin de
# ligne rend le script inexécutable (« not found », code 127).
RUN sed -i 's/\r$//' /tmp/post-install-scripts/*.sh
