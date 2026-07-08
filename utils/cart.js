export function ensureVendorCart(req, vendorId) {
  if (!req.session.cart) {
    req.session.cart = {};
  }

  if (!req.session.cart[vendorId]) {
    req.session.cart[vendorId] = [];
  }

  return req.session.cart[vendorId];
}

export function getPositiveQuantity(value, fallback = 1) {
  const quantity = Number.parseInt(value, 10);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : fallback;
}

export function calculateCartTotal(items = []) {
  return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

export function flattenCart(cart = {}) {
  return Object.entries(cart).flatMap(([vendorId, items]) =>
    items.map((item) => ({
      ...item,
      vendorId
    }))
  );
}

export function getCartSummary(cart = {}) {
  const countsByVendor = {};
  let totalCount = 0;

  for (const [vendorId, items] of Object.entries(cart)) {
    const vendorCount = items.reduce(
      (sum, item) => sum + Number(item.qty || 0),
      0
    );

    countsByVendor[vendorId] = vendorCount;
    totalCount += vendorCount;
  }

  return {
    countsByVendor,
    totalCount
  };
}
