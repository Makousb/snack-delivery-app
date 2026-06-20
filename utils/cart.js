export function ensureRestaurantCart(req, restaurantId) {
  if (!req.session.cart) {
    req.session.cart = {};
  }

  if (!req.session.cart[restaurantId]) {
    req.session.cart[restaurantId] = [];
  }

  return req.session.cart[restaurantId];
}

export function getPositiveQuantity(value, fallback = 1) {
  const quantity = Number.parseInt(value, 10);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : fallback;
}

export function calculateCartTotal(items = []) {
  return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

export function flattenCart(cart = {}) {
  return Object.entries(cart).flatMap(([restaurantId, items]) =>
    items.map((item) => ({
      ...item,
      restaurantId
    }))
  );
}

export function getCartSummary(cart = {}) {
  const countsByRestaurant = {};
  let totalCount = 0;

  for (const [restaurantId, items] of Object.entries(cart)) {
    const restaurantCount = items.reduce(
      (sum, item) => sum + Number(item.qty || 0),
      0
    );

    countsByRestaurant[restaurantId] = restaurantCount;
    totalCount += restaurantCount;
  }

  return {
    countsByRestaurant,
    totalCount
  };
}
