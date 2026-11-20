<!doctype html>
<html lang="{$slimroom_lang|escape:'html':'UTF-8'}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#120e1f">
    <title>{$slimroom_shop_name|escape:'html':'UTF-8'}</title>
    <link rel="stylesheet" href="{$slimroom_assets|escape:'html':'UTF-8'}room.css?v={$slimroom_version|escape:'url'}">
  </head>
  <body>
    <div id="app"></div>
    <script>window.SLIMROOM = {$slimroom_config nofilter};</script>
    <script type="module" src="{$slimroom_assets|escape:'html':'UTF-8'}room.js?v={$slimroom_version|escape:'url'}"></script>
  </body>
</html>
