// Shared UI niceties: image fallbacks, scroll-reveal, toasts, navbar state.
(function () {
  const FALLBACK_IMAGE = "/images/placeholder.png";

  // Swap broken images for the placeholder instead of showing alt text.
  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      applyFallback(img);
    },
    true
  );

  function applyFallback(img) {
    if (img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = "1";
    img
      .closest("picture")
      ?.querySelectorAll("source")
      .forEach((source) => source.remove());
    img.srcset = "";
    img.src = FALLBACK_IMAGE;
    img.classList.add("img-fallback");
  }

  // Catch images that already failed before this script attached.
  function sweepBrokenImages() {
    document.querySelectorAll("img").forEach((img) => {
      if (img.complete && img.naturalWidth === 0 && img.src) {
        applyFallback(img);
      }
    });
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Gentle rise-in for cards as they scroll into view.
  function setupReveal() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;

    const targets = document.querySelectorAll(
      [
        ".marketplace-vendor-card",
        ".marketplace-item-card",
        ".marketplace-category-card",
        ".marketplace-deals article",
        ".menu-card",
        ".street-compare-card",
        ".feature-callout",
        ".partner-card",
        ".landing-feature-card"
      ].join(", ")
    );
    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 }
    );

    targets.forEach((el, index) => {
      el.classList.add("reveal-init");
      el.style.setProperty("--reveal-delay", `${(index % 5) * 55}ms`);
      observer.observe(el);
    });
  }

  // Small confirmation toasts (e.g. "Added to cart").
  let toastEl = null;
  let toastTimer = null;

  window.snackToast = function (message) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "snack-toast";
      toastEl.setAttribute("role", "status");
      toastEl.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 12.5 5 5L19.5 7"/></svg><span></span>';
      document.body.appendChild(toastEl);
    }

    toastEl.querySelector("span").textContent = message;
    toastEl.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
  };

  // Deepen the navbar shadow once the page scrolls.
  function setupNavbarState() {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;

    const update = () => navbar.classList.toggle("nav-scrolled", window.scrollY > 10);
    update();
    document.addEventListener("scroll", update, { passive: true });
  }

  function init() {
    sweepBrokenImages();
    setupReveal();
    setupNavbarState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Late failures (lazy-loaded images) are covered by the capture listener,
  // but run one more sweep after everything settles.
  window.addEventListener("load", sweepBrokenImages);
})();
