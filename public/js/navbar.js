document.addEventListener("DOMContentLoaded", () => {
  const burgerBtn = document.getElementById("burger-btn");
  const burgerMenu = document.getElementById("burger-menu");
  const overlay = document.getElementById("burger-overlay");
  const themeToggle = document.getElementById("theme-toggle");

  if (!burgerBtn || !burgerMenu) return;

  const openMenu = () => {
    burgerMenu.classList.add("show");
    overlay?.classList.add("show");
    burgerBtn.setAttribute("aria-expanded", "true");
  };

  const closeMenu = () => {
    burgerMenu.classList.remove("show");
    overlay?.classList.remove("show");
    burgerBtn.setAttribute("aria-expanded", "false");
  };

  const toggleMenu = (event) => {
    event.stopPropagation();
    burgerMenu.classList.contains("show") ? closeMenu() : openMenu();
  };

  burgerBtn.addEventListener("click", toggleMenu);
  overlay?.addEventListener("click", closeMenu);

  document.addEventListener("click", (event) => {
    if (!burgerMenu.contains(event.target) && !burgerBtn.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  const applyTheme = (theme) => {
    document.body.classList.toggle("dark", theme === "dark");

    if (themeToggle) {
      themeToggle.innerText = theme === "dark" ? "Light Mode" : "Dark Mode";
    }
  };

  const savedTheme = localStorage.getItem("theme") || "light";
  applyTheme(savedTheme);

  themeToggle?.addEventListener("click", () => {
    const newTheme = document.body.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  });
});
