document.addEventListener("DOMContentLoaded", () => {
  const cartDrawer = document.getElementById("cart-drawer");
  const cartDrawerOverlay = document.getElementById("cart-drawer-overlay");
  const cartDrawerBody = document.getElementById("cart-drawer-body");
  const cartDrawerTotal = document.getElementById("cart-drawer-total");
  const cartDrawerClose = document.getElementById("cart-drawer-close");
  const cartCountEl = document.getElementById("cart-count");
  const cartTriggers = document.querySelectorAll('#cart-icon, .floating-cart, .side-menu-link[href="/cart"]');

  if (!cartDrawer) return;

  function formatDrawerCurrency(amount) {
    const formatted = Number(amount || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    return `KSh ${formatted}`;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  function renderCartDrawer(data) {
    const items = data.items || [];

    if (cartCountEl) cartCountEl.innerText = data.count ?? 0;
    if (cartDrawerTotal) cartDrawerTotal.innerText = formatDrawerCurrency(data.total);
    if (!cartDrawerBody) return;

    if (items.length === 0) {
      cartDrawerBody.innerHTML = '<p class="cart-drawer-empty">Your cart is empty.</p>';
      return;
    }

    cartDrawerBody.innerHTML = items.map((item) => `
      <div class="cart-drawer-item">
        <div class="cart-drawer-item-copy">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${formatDrawerCurrency(item.price)} &times; ${item.qty}</span>
        </div>
        <div class="cart-drawer-item-actions">
          <span class="cart-drawer-item-total">${formatDrawerCurrency(item.price * item.qty)}</span>
          <button type="button" class="cart-drawer-remove" data-vendor-id="${escapeHtml(item.vendorId)}" data-item-id="${escapeHtml(String(item.id))}">Remove</button>
        </div>
      </div>
    `).join("");
  }

  async function fetchCartDrawer() {
    try {
      const response = await fetch("/cart/items");
      renderCartDrawer(await response.json());
    } catch (error) {
      console.error("Failed to load cart:", error);
    }
  }

  function openCartDrawer() {
    cartDrawer.classList.add("show");
    cartDrawerOverlay?.classList.add("show");
    cartDrawer.setAttribute("aria-hidden", "false");
    fetchCartDrawer();
  }

  function closeCartDrawer() {
    cartDrawer.classList.remove("show");
    cartDrawerOverlay?.classList.remove("show");
    cartDrawer.setAttribute("aria-hidden", "true");
  }

  cartTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openCartDrawer();
    });
  });

  cartDrawerClose?.addEventListener("click", closeCartDrawer);
  cartDrawerOverlay?.addEventListener("click", closeCartDrawer);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCartDrawer();
  });

  cartDrawerBody?.addEventListener("click", async (event) => {
    const button = event.target.closest(".cart-drawer-remove");
    if (!button) return;

    try {
      const response = await fetch("/cart/update-ajax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: button.dataset.vendorId,
          itemId: button.dataset.itemId,
          qty: 0
        })
      });
      renderCartDrawer(await response.json());
    } catch (error) {
      console.error("Failed to remove item:", error);
    }
  });

  window.cartDrawer = {
    refreshIfOpen() {
      if (cartDrawer.classList.contains("show")) {
        fetchCartDrawer();
      }
    }
  };
});
