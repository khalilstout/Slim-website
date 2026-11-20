#!/bin/sh
# Exécuté une seule fois par l'image PrestaShop, juste après l'installation automatique.
set -e
cd /var/www/html
runuser -g www-data -u www-data -- php bin/console prestashop:module install slimroom
