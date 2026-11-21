<?php
/**
 * Slim Room : remplace la page d'accueil de la boutique par la chambre 3D
 * (front three.js compilé dans views/dist) et expose une petite API JSON
 * (catalogue + panier) utilisée par ce front.
 */
if (!defined('_PS_VERSION_')) {
    exit;
}

class SlimRoom extends Module
{
    public function __construct()
    {
        $this->name = 'slimroom';
        $this->tab = 'front_office_features';
        $this->version = '0.1.0';
        $this->author = 'Slim';
        $this->need_instance = 0;
        $this->ps_versions_compliancy = ['min' => '8.0.0', 'max' => _PS_VERSION_];

        parent::__construct();

        $this->displayName = 'Slim Room';
        $this->description = 'Page d\'accueil en 3D : une chambre dont les objets ouvrent la boutique.';
    }

    public function install()
    {
        return parent::install()
            && $this->registerHook('actionFrontControllerInitAfter')
            && $this->installDemoCatalog();
    }

    /**
     * Sur la page d'accueil, on affiche la chambre à la place du thème.
     */
    public function hookActionFrontControllerInitAfter(array $params)
    {
        $controller = $params['controller'] ?? null;
        if (!$controller instanceof IndexController || Tools::getValue('ajax')) {
            return;
        }

        $dist = $this->getLocalPath() . 'views/dist/assets/';
        $link = $this->context->link;
        $this->context->smarty->assign([
            'slimroom_lang' => $this->context->language->iso_code,
            'slimroom_shop_name' => Configuration::get('PS_SHOP_NAME'),
            'slimroom_assets' => $this->getPathUri() . 'views/dist/assets/',
            // Change à chaque nouveau build : évite de servir un vieux JS depuis le cache.
            'slimroom_version' => file_exists($dist . 'room.js') ? filemtime($dist . 'room.js') : $this->version,
            // Lu par le front dans l'attribut data-slimroom de la page (voir room.tpl).
            'slimroom_config' => json_encode([
                'apiUrl' => $link->getModuleLink($this->name, 'api'),
                'cartUrl' => $link->getPageLink('cart'),
                'token' => Tools::getToken(false),
            ]),
        ]);

        header('Content-Type: text/html; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('X-Frame-Options: SAMEORIGIN');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
        // Politique de sécurité de la page : rien ne se charge hors du site, sauf
        // les vidéos YouTube des easter eggs. À compléter si on ajoute un service externe.
        header('Content-Security-Policy: ' . implode('; ', [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "connect-src 'self' blob: data:",
            'frame-src https://www.youtube-nocookie.com',
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
        ]));
        // Selon le réglage « compilation des templates » de la boutique, Smarty peut
        // resservir indéfiniment une ancienne version de room.tpl. On lui demande
        // de vérifier la date du fichier, le temps de ce rendu.
        $smarty = $this->context->smarty;
        $compileCheck = $smarty->getCompileCheck();
        $smarty->setCompileCheck(true);
        $html = $smarty->fetch($this->getLocalPath() . 'views/templates/front/room.tpl');
        $smarty->setCompileCheck($compileCheck);
        // En mode développement, PrestaShop entoure les templates de commentaires ;
        // placés avant le doctype, ils feraient passer le navigateur en mode « quirks ».
        echo trim(preg_replace('/<!-- (begin|end) \S+ -->/', '', $html));
        exit;
    }

    /**
     * Catalogue de démonstration, pour avoir une boutique utilisable dès
     * l'installation. Les slugs correspondent à ceux de frontend/src/config.ts.
     */
    private function installDemoCatalog()
    {
        $catalog = [
            'cds' => ['CDs', [
                ["J'rentre dedans", 12],
                ["J'reste dedans + exclu", 15],
                ['Vinyle édition limitée', 28],
            ]],
            'vetements' => ['Vêtements', [
                ['T-shirt Slim', 25],
                ['Hoodie Slim', 55],
                ['Casquette', 20],
            ]],
            'posters' => ['Posters', [
                ['Poster A2', 18],
                ['Poster A2 dédicacé', 30],
            ]],
        ];

        $languages = Language::getIDs(false);
        $perLanguage = static function ($value) use ($languages) {
            return array_fill_keys($languages, $value);
        };
        $home = (int) Configuration::get('PS_HOME_CATEGORY');

        foreach ($catalog as $slug => [$categoryName, $products]) {
            if (Category::searchByNameAndParentCategoryId((int) Configuration::get('PS_LANG_DEFAULT'), $categoryName, $home)) {
                continue; // déjà créé lors d'une installation précédente
            }

            $category = new Category();
            $category->name = $perLanguage($categoryName);
            $category->link_rewrite = $perLanguage($slug);
            $category->id_parent = $home;
            $category->active = true;
            if (!$category->add()) {
                return false;
            }

            foreach ($products as [$productName, $price]) {
                $product = new Product();
                $product->name = $perLanguage($productName);
                $product->link_rewrite = $perLanguage(Tools::str2url($productName));
                $product->price = $price;
                $product->id_tax_rules_group = 0;
                $product->id_category_default = (int) $category->id;
                $product->active = true;
                if (!$product->add()) {
                    return false;
                }
                $product->addToCategories([(int) $category->id]);
                StockAvailable::setQuantity((int) $product->id, 0, 100);
            }
        }

        return true;
    }
}
