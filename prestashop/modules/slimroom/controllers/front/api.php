<?php
/**
 * API JSON du front 3D.
 *   GET …/module/slimroom/api            → { categories, cart }
 *   GET …/module/slimroom/api?only=cart  → { count, items, total, checkoutUrl }
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
        $this->ajaxRender(json_encode($data));
        exit;
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
                $hasImage = !empty($product['id_image']) && strpos($product['id_image'], 'default') === false;
                $products[] = [
                    'id' => (int) $product['id_product'],
                    'attributeId' => (int) $product['id_product_attribute'],
                    'name' => $product['name'],
                    'price' => $this->formatPrice((float) $product['price']),
                    'image' => $hasImage
                        ? $this->context->link->getImageLink($product['link_rewrite'], $product['id_image'], 'home_default')
                        : null,
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
                    'name' => $product['name'],
                    'quantity' => (int) $product['cart_quantity'],
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
