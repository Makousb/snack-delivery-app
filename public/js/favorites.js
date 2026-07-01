// Delegated handler for heart toggles. Works even when the heart sits inside a
// clickable vendor-card link (stopPropagation + preventDefault stop navigation).
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-favorite-toggle]");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  const vendorId = button.dataset.vendorId;
  if (!vendorId || button.disabled) return;

  button.disabled = true;

  try {
    const res = await fetch("/favorites/" + encodeURIComponent(vendorId) + "/toggle", {
      method: "POST",
      headers: { "X-Requested-With": "fetch" }
    });

    if (res.status === 401) {
      window.location.href = "/auth/login";
      return;
    }
    if (!res.ok) return;

    const data = await res.json();
    button.classList.toggle("is-favorited", data.favorited);
    button.setAttribute("aria-pressed", String(data.favorited));
    button.setAttribute("aria-label", data.favorited ? "Remove from favourites" : "Save to favourites");
  } catch (_) {
    // Ignore transient failures; the state simply stays as it was.
  } finally {
    button.disabled = false;
  }
});
