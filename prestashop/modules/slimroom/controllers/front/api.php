<?php
/**
 * API JSON du front 3D.
 *   GET …/module/slimroom/api            → { categories, cart }
 *   GET …/module/slimroom/api?only=cart  → { count, items, total, checkoutUrl }
 * Lecture seule : toute modification du panier passe par le contrôleur natif
 * de PrestaShop (protégé par jeton), jamais par ce fichier.
 */
class SlimRoomApiModuleFrontController extends ModuleFrontController
{
    public function postProcess()
    {
        $cart = $this->cart();
        $data = Tools::getValue('only') === 'cart'
            ? $cart
            : ['categories' => $this->categories(), 'cart' => $cart];

        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        $this->ajaxRender(json_encode($data));
        exit;
    }

    private function imageUrl($linkRewrite, $idImage)
    {
        if (empty($idImage) || strpos((string) $idImage, 'default') !== false) {
            return null;
        }

        return $this->context->link->getImageLink($linkRewrite, $idImage, 'home_default');
    }

    private function formatPrice($amount)
    {
        return $this->context->getCurrentLocale()->formatPrice($amount, $this->context->currency->iso_code);
    }

    /**
     * Catégories actives placées directement sous « Accueil », avec leurs produits.
     */
    private function categories()
    {
        $idLang = (int) $this->context->language->id;
        $home = (int) Configuration::get('PS_HOME_CATEGORY');
        $result = [];

        foreach (Category::getChildren($home, $idLang, true) as $row) {
            $category = new Category((int) $row['id_category'], $idLang);
            $products = [];
            foreach ($category->getProducts($idLang, 1, 100) ?: [] as $product) {
                $products[] = [
                    'id' => (int) $product['id_product'],
                    'attributeId' => (int) $product['id_product_attribute'],
                    'name' => $product['name'],
                    'price' => $this->formatPrice((float) $product['price']),
                    'image' => $this->imageUrl($product['link_rewrite'], $product['id_image']),
                ];
            }
            $result[] = [
                'slug' => $category->link_rewrite,
                'name' => $category->name,
                'products' => $products,
            ];
        }

        return $result;
    }

    private function cart()
    {
        $cart = $this->context->cart;
        $items = [];
        $count = 0;
        $total = 0.0;

        if (Validate::isLoadedObject($cart)) {
            foreach ($cart->getProducts() as $product) {
                $count += (int) $product['cart_quantity'];
                $items[] = [
                    'id' => (int) $product['id_product'],
                    'attributeId' => (int) $product['id_product_attribute'],
                    'name' => $product['name'],
                    // Déclinaison choisie (« Taille : M »), vide pour un produit simple.
                    'detail' => (string) ($product['attributes_small'] ?? ''),
                    'quantity' => (int) $product['cart_quantity'],
                    'price' => $this->formatPrice((float) $product['price_wt']),
                    'image' => $this->imageUrl($product['link_rewrite'] ?? '', $product['id_image'] ?? null),
                    'total' => $this->formatPrice((float) $product['total_wt']),
                ];
            }
            $total = (float) $cart->getOrderTotal(true, Cart::ONLY_PRODUCTS);
        }

        return [
            'count' => $count,
            'items' => $items,
            'total' => $this->formatPrice($total),
            'checkoutUrl' => $this->context->link->getPageLink('cart', null, null, ['action' => 'show']),
        ];
    }
}
